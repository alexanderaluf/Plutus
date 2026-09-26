package expo.modules.plutuslocalai

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Build
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Process-wide owner of the model file. The system DownloadManager performs the
 * transfer so it continues outside the chat screen, in the background, and
 * across process death. The finished file is verified and moved to
 * noBackupFilesDir: app-private, excluded from Auto Backup, removed on uninstall,
 * and kept across app updates.
 */
object LocalAIModelStore {
  const val MODEL_NAME = "gemma-4-E2B-it.litertlm"
  const val MODEL_SIZE = 2_588_147_712L
  private const val MODEL_STEM = "gemma-4-E2B-it"
  private const val MODEL_SHA256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
  private const val MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm"
  private const val PREFS = "plutus-local-ai"
  private const val DOWNLOAD_ID = "downloadId"
  private const val RUNTIME_TAG = "runtimeTag"
  private const val STAGING_DIR = "local-ai-download"

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val lock = Any()
  @Volatile private var verifying = false
  @Volatile private var lastError: String? = null

  private fun modelDir(context: Context) = File(context.noBackupFilesDir, "local-ai").apply { mkdirs() }
  fun modelFile(context: Context) = File(modelDir(context), MODEL_NAME)
  fun isInstalled(context: Context) = modelFile(context).let { it.exists() && it.length() == MODEL_SIZE }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun downloads(context: Context) = context.getSystemService(DownloadManager::class.java)

  /** Moves pre-release installs out of the backed-up filesDir and drops superseded models. */
  private fun migrateAndClean(context: Context) {
    val legacy = File(context.filesDir, MODEL_NAME)
    if (legacy.exists()) {
      if (legacy.length() != MODEL_SIZE || isInstalled(context) || !legacy.renameTo(modelFile(context))) legacy.delete()
    }
    File(context.filesDir, "$MODEL_NAME.partial").delete()
    modelDir(context).listFiles()?.forEach { entry ->
      if (entry.name.endsWith(".litertlm") && entry.name != MODEL_NAME) entry.delete()
    }
  }

  fun state(context: Context): Map<String, Any?> = synchronized(lock) {
    migrateAndClean(context)
    if (isInstalled(context)) {
      clearDownload(context)
      return state("installed", MODEL_SIZE)
    }
    if (verifying) return state("verifying", MODEL_SIZE)
    val id = prefs(context).getLong(DOWNLOAD_ID, -1L)
    if (id != -1L) {
      downloads(context).query(DownloadManager.Query().setFilterById(id)).use { cursor ->
        if (cursor.moveToFirst()) {
          val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
          val received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
          when (status) {
            DownloadManager.STATUS_SUCCESSFUL -> {
              val uri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
              verify(context, id, uri)
              return state("verifying", MODEL_SIZE)
            }
            DownloadManager.STATUS_FAILED -> {
              val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
              lastError = "Model download failed ($reason)"
              clearDownload(context)
            }
            DownloadManager.STATUS_PAUSED -> return state("paused", received)
            else -> return state("downloading", received)
          }
        } else {
          // Stale id, for example after a restore to another device.
          prefs(context).edit().remove(DOWNLOAD_ID).apply()
        }
      }
    }
    lastError?.let { return mapOf("status" to "failed", "received" to 0L, "total" to MODEL_SIZE, "error" to it) }
    state("idle", 0L)
  }

  /** Called from the main thread; the query and any finalization run on IO. */
  fun refreshInBackground(context: Context) {
    scope.launch { runCatching { state(context) } }
  }

  private fun state(status: String, received: Long) =
    mapOf("status" to status, "received" to received, "total" to MODEL_SIZE, "error" to null)

  fun start(context: Context) = synchronized(lock) {
    val current = state(context)["status"]
    if (current != "idle" && current != "failed") return@synchronized
    val staging = checkNotNull(context.getExternalFilesDir(STAGING_DIR)) { "Device storage is unavailable" }
    staging.listFiles()?.forEach { it.delete() }
    val request = DownloadManager.Request(Uri.parse(MODEL_URL))
      .setTitle("Plutus AI")
      .setDescription(MODEL_NAME)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
      .setAllowedOverMetered(true)
      .setDestinationInExternalFilesDir(context, STAGING_DIR, "$MODEL_NAME.download")
    lastError = null
    prefs(context).edit().putLong(DOWNLOAD_ID, downloads(context).enqueue(request)).apply()
  }

  /** Hashes while copying into private storage; only a verified file gets the final name. */
  private fun verify(context: Context, id: Long, localUri: String?) {
    if (verifying) return
    verifying = true
    scope.launch {
      val partial = File(modelDir(context), "$MODEL_NAME.partial")
      try {
        val source = File(checkNotNull(Uri.parse(checkNotNull(localUri)).path) { "Download is missing" })
        val digest = MessageDigest.getInstance("SHA-256")
        source.inputStream().buffered(1024 * 1024).use { input ->
          partial.outputStream().buffered(1024 * 1024).use { output ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
              val count = input.read(buffer)
              if (count == -1) break
              digest.update(buffer, 0, count)
              output.write(buffer, 0, count)
            }
          }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        check(partial.length() == MODEL_SIZE && actual == MODEL_SHA256) { "Model download failed verification" }
        check(partial.renameTo(modelFile(context))) { "Could not install verified model" }
        lastError = null
      } catch (error: Exception) {
        partial.delete()
        lastError = error.message ?: error.toString()
      } finally {
        synchronized(lock) {
          downloads(context).remove(id)
          prefs(context).edit().remove(DOWNLOAD_ID).apply()
          verifying = false
        }
      }
    }
  }

  private fun clearDownload(context: Context) {
    val id = prefs(context).getLong(DOWNLOAD_ID, -1L)
    if (id != -1L && !verifying) {
      downloads(context).remove(id)
      prefs(context).edit().remove(DOWNLOAD_ID).apply()
    }
  }

  /**
   * LiteRT-LM keeps compiled caches in cacheDir. Drop them once after each app
   * install or update so a newer runtime never reads an older runtime's cache.
   */
  fun prepareRuntime(context: Context) {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    val tag = "$versionCode:${info.lastUpdateTime}"
    if (prefs(context).getString(RUNTIME_TAG, null) == tag) return
    clearRuntimeCache(context)
    prefs(context).edit().putString(RUNTIME_TAG, tag).apply()
  }

  fun clearRuntimeCache(context: Context) {
    context.cacheDir.listFiles()?.forEach { entry ->
      if (entry.name.startsWith(MODEL_STEM)) entry.deleteRecursively()
    }
  }
}
