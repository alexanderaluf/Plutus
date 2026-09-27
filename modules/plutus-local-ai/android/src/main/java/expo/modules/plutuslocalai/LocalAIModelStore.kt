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

/** Owns two independent, verified, app-private model downloads. */
object LocalAIModelStore {
  private data class Model(val key: String, val name: String, val size: Long, val hash: String, val url: String)
  private val models = mapOf(
    "E2B" to Model("E2B", "gemma-4-E2B-it.litertlm", 2_588_147_712L,
      "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c",
      "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm"),
    "E4B" to Model("E4B", "gemma-4-E4B-it.litertlm", 3_659_530_240L,
      "0b2a8980ce155fd97673d8e820b4d29d9c7d99b8fa6806f425d969b145bd52e0",
      "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/28299f3/gemma-4-E4B-it.litertlm"),
  )
  private fun model(key: String) = requireNotNull(models[key]) { "Unknown local AI model" }
  private const val PREFS = "plutus-local-ai"
  private const val RUNTIME_TAG = "runtimeTag"
  private const val STAGING_DIR = "local-ai-download"
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val lock = Any()
  private val verifying = mutableSetOf<String>()
  private val errors = mutableMapOf<String, String>()

  private fun modelDir(context: Context) = File(context.noBackupFilesDir, "local-ai").apply { mkdirs() }
  fun modelFile(context: Context, key: String) = File(modelDir(context), model(key).name)
  fun isInstalled(context: Context, key: String) = modelFile(context, key).let { it.exists() && it.length() == model(key).size }
  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun downloads(context: Context) = context.getSystemService(DownloadManager::class.java)
  private fun downloadKey(key: String) = if (key == "E2B") "downloadId" else "downloadId-$key"

  private fun migrateLegacy(context: Context) {
    val old = File(context.filesDir, model("E2B").name)
    if (old.exists()) {
      if (old.length() != model("E2B").size || isInstalled(context, "E2B") || !old.renameTo(modelFile(context, "E2B"))) old.delete()
    }
    File(context.filesDir, "${model("E2B").name}.partial").delete()
  }

  private fun state(status: String, received: Long, size: Long, error: String? = null) =
    mapOf("status" to status, "received" to received, "total" to size, "error" to error)

  fun state(context: Context, key: String): Map<String, Any?> = synchronized(lock) {
    val spec = model(key)
    migrateLegacy(context)
    if (isInstalled(context, key)) {
      clearDownload(context, key)
      return state("installed", spec.size, spec.size)
    }
    if (key in verifying) return state("verifying", spec.size, spec.size)
    val id = prefs(context).getLong(downloadKey(key), -1L)
    if (id != -1L) {
      downloads(context).query(DownloadManager.Query().setFilterById(id)).use { cursor ->
        if (cursor.moveToFirst()) {
          val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
          val received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
          when (status) {
            DownloadManager.STATUS_SUCCESSFUL -> {
              val uri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
              verify(context, spec, id, uri)
              return state("verifying", spec.size, spec.size)
            }
            DownloadManager.STATUS_FAILED -> {
              errors[key] = "Model download failed (${cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))})"
              clearDownload(context, key)
            }
            DownloadManager.STATUS_PAUSED -> return state("paused", received, spec.size)
            else -> return state("downloading", received, spec.size)
          }
        } else prefs(context).edit().remove(downloadKey(key)).apply()
      }
    }
    errors[key]?.let { return state("failed", 0, spec.size, it) }
    state("idle", 0, spec.size)
  }

  fun refreshInBackground(context: Context) {
    scope.launch { models.keys.forEach { key -> runCatching { state(context, key) } } }
  }

  fun start(context: Context, key: String) = synchronized(lock) {
    val spec = model(key)
    val current = state(context, key)["status"]
    if (current != "idle" && current != "failed") return@synchronized
    val staging = checkNotNull(context.getExternalFilesDir(STAGING_DIR)) { "Device storage is unavailable" }
    File(staging, "${spec.name}.download").delete()
    val request = DownloadManager.Request(Uri.parse(spec.url))
      .setTitle("Plutus AI")
      .setDescription(spec.name)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
      .setAllowedOverMetered(true)
      .setDestinationInExternalFilesDir(context, STAGING_DIR, "${spec.name}.download")
    errors.remove(key)
    prefs(context).edit().putLong(downloadKey(key), downloads(context).enqueue(request)).apply()
  }

  private fun verify(context: Context, spec: Model, id: Long, localUri: String?) {
    if (!verifying.add(spec.key)) return
    scope.launch {
      val partial = File(modelDir(context), "${spec.name}.partial")
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
        check(partial.length() == spec.size && actual == spec.hash) { "Model download failed verification" }
        check(partial.renameTo(modelFile(context, spec.key))) { "Could not install verified model" }
        synchronized(lock) { errors.remove(spec.key) }
      } catch (error: Exception) {
        partial.delete()
        synchronized(lock) { errors[spec.key] = error.message ?: error.toString() }
      } finally {
        synchronized(lock) {
          downloads(context).remove(id)
          prefs(context).edit().remove(downloadKey(spec.key)).apply()
          verifying.remove(spec.key)
        }
      }
    }
  }

  private fun clearDownload(context: Context, key: String) {
    val id = prefs(context).getLong(downloadKey(key), -1L)
    if (id != -1L && key !in verifying) {
      downloads(context).remove(id)
      prefs(context).edit().remove(downloadKey(key)).apply()
    }
  }

  fun delete(context: Context, key: String) = synchronized(lock) {
    val spec = model(key)
    check(key !in verifying) { "Model is being verified" }
    clearDownload(context, key)
    File(modelDir(context), "${spec.name}.partial").delete()
    File(context.getExternalFilesDir(STAGING_DIR), "${spec.name}.download").delete()
    check(!modelFile(context, key).exists() || modelFile(context, key).delete()) { "Could not delete model" }
    errors.remove(key)
    clearRuntimeCache(context, key)
  }

  fun prepareRuntime(context: Context) {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    val tag = "$versionCode:${info.lastUpdateTime}"
    if (prefs(context).getString(RUNTIME_TAG, null) == tag) return
    clearRuntimeCache(context)
    prefs(context).edit().putString(RUNTIME_TAG, tag).apply()
  }

  fun clearRuntimeCache(context: Context, key: String? = null) {
    context.cacheDir.listFiles()?.forEach { entry ->
      if (models.values.any { spec -> (key == null || spec.key == key) && entry.name.startsWith(spec.name.removeSuffix(".litertlm")) }) entry.deleteRecursively()
    }
  }
}
