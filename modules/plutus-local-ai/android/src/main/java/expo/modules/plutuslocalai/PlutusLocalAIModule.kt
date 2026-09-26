package expo.modules.plutuslocalai

import android.app.DownloadManager
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import java.io.File
import java.io.RandomAccessFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** The model stays in app-private storage. Chat content is never uploaded. */
class PlutusLocalAIModule : Module() {
  private var audioRecord: AudioRecord? = null
  private var recordingThread: Thread? = null
  private var recordingFile: File? = null
  @Volatile private var recording = false
  private var downloadReceiver: BroadcastReceiver? = null
  @Volatile private var level = 0f

  private val context: Context get() = requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("PlutusLocalAI")

    OnCreate {
      val context = appContext.reactContext?.applicationContext ?: return@OnCreate
      // Finalize a download that completed while this process was not running.
      LocalAIModelStore.refreshInBackground(context)
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(receiverContext: Context, intent: Intent) {
          LocalAIModelStore.refreshInBackground(receiverContext.applicationContext)
        }
      }
      val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      else context.registerReceiver(receiver, filter)
      downloadReceiver = receiver
    }

    OnDestroy {
      downloadReceiver?.let { receiver -> runCatching { appContext.reactContext?.applicationContext?.unregisterReceiver(receiver) } }
      downloadReceiver = null
      recording = false
      runCatching { audioRecord?.stop() }
      audioRecord?.release()
      audioRecord = null
      recordingFile?.delete()
      recordingFile = null
    }

    AsyncFunction("isInstalledAsync") Coroutine { ->
      withContext(Dispatchers.IO) { LocalAIModelStore.isInstalled(context) }
    }

    AsyncFunction("getDownloadStateAsync") Coroutine { ->
      withContext(Dispatchers.IO) { LocalAIModelStore.state(context) }
    }

    AsyncFunction("downloadAsync") Coroutine { ->
      withContext(Dispatchers.IO) { LocalAIModelStore.start(context) }
    }

    AsyncFunction("getModelPathAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        check(LocalAIModelStore.isInstalled(context)) { "Model is not installed" }
        LocalAIModelStore.prepareRuntime(context)
        LocalAIModelStore.modelFile(context).absolutePath
      }
    }

    AsyncFunction("getAvailableMemoryAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        val memory = ActivityManager.MemoryInfo()
        context.getSystemService(ActivityManager::class.java).getMemoryInfo(memory)
        if (memory.lowMemory) 0L else memory.availMem
      }
    }

    AsyncFunction("clearRuntimeCacheAsync") Coroutine { ->
      withContext(Dispatchers.IO) { LocalAIModelStore.clearRuntimeCache(context) }
    }

    // Speech is transcribed by the local Gemma model from a WAV file; the
    // platform recognizer is not used on Android. Kept as a no-op for the
    // shared JS interface.
    AsyncFunction("cancelVoiceRecognitionAsync") { -> Unit }

    AsyncFunction("startRecordingAsync") Coroutine { maxDurationMs: Int ->
      withContext(Dispatchers.IO) {
        check(!recording) { "Already recording" }
        val bufferSize = maxOf(AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), 4096)
        // Speech-tuned input first; some devices only initialize the generic mic.
        val record = listOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC)
          .asSequence()
          .map { source -> AudioRecord(source, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize) }
          .firstOrNull { candidate ->
            (candidate.state == AudioRecord.STATE_INITIALIZED).also { ready -> if (!ready) candidate.release() }
          } ?: throw IllegalStateException("AUDIO_RECORD_FAILED: microphone initialization failed")
        val file = File.createTempFile(FILE_PREFIX, ".wav", context.cacheDir)
        val maxBytes = SAMPLE_RATE.toLong() * 2 * maxOf(1, minOf(maxDurationMs, MAX_DURATION_MS)) / 1000
        audioRecord = record
        recordingFile = file
        level = 0f
        recording = true
        record.startRecording()
        recordingThread = Thread {
          try {
            file.outputStream().buffered().use { output ->
              output.write(ByteArray(44))
              val buffer = ByteArray(bufferSize)
              var total = 0L
              while (recording && total < maxBytes) {
                val count = record.read(buffer, 0, buffer.size)
                if (count <= 0) continue
                val allowed = minOf(count.toLong(), maxBytes - total).toInt()
                output.write(buffer, 0, allowed)
                total += allowed
                // Peak amplitude for the level meter; audio never leaves the device.
                var peak = 0
                var index = 0
                while (index + 1 < allowed) {
                  val sample = (buffer[index].toInt() and 0xff) or (buffer[index + 1].toInt() shl 8)
                  peak = maxOf(peak, kotlin.math.abs(sample.toShort().toInt()))
                  index += 2
                }
                level = peak / 32768f
              }
            }
          } catch (_: Exception) { /* stopRecordingAsync reports an unusable file */ }
        }.also { it.start() }
      }
    }

    AsyncFunction("getRecordingLevelAsync") { -> if (recording) level.toDouble() else 0.0 }

    AsyncFunction("stopRecordingAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        recording = false
        runCatching { audioRecord?.stop() }
        recordingThread?.join(3_000)
        audioRecord?.release()
        audioRecord = null
        recordingThread = null
        val file = checkNotNull(recordingFile) { "AUDIO_RECORD_FAILED: no recording" }
        recordingFile = null
        val bytes = file.length() - 44
        if (bytes <= 0) {
          file.delete()
          throw IllegalStateException("AUDIO_EMPTY: nothing was recorded")
        }
        RandomAccessFile(file, "rw").use { wav ->
          fun little(value: Int, bytesCount: Int) { repeat(bytesCount) { wav.write((value ushr (8 * it)) and 0xff) } }
          wav.seek(0)
          wav.writeBytes("RIFF"); little((bytes + 36).toInt(), 4); wav.writeBytes("WAVEfmt ")
          little(16, 4); little(1, 2); little(1, 2); little(SAMPLE_RATE, 4)
          little(SAMPLE_RATE * 2, 4); little(2, 2); little(16, 2); wav.writeBytes("data"); little(bytes.toInt(), 4)
        }
        wavInfo(file)
      }
    }

    AsyncFunction("stopRecordingAndDeleteAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        if (recording) {
          recording = false
          runCatching { audioRecord?.stop() }
          recordingThread?.join(3_000)
          audioRecord?.release()
          audioRecord = null
          recordingThread = null
        }
        recordingFile?.delete()
        recordingFile = null
      }
    }

    AsyncFunction("deleteRecordingAsync") Coroutine { path: String ->
      withContext(Dispatchers.IO) { ownedRecording(path)?.delete() ?: false }
    }

    AsyncFunction("inspectRecordingAsync") Coroutine { path: String ->
      withContext(Dispatchers.IO) {
        wavInfo(checkNotNull(ownedRecording(path)) { "AUDIO_FORMAT_INVALID: not an app recording" })
      }
    }
  }

  /** Only temporary voice files created by this module may be read or deleted. */
  private fun ownedRecording(path: String): File? {
    val file = File(path.removePrefix("file://")).canonicalFile
    val cache = context.cacheDir.canonicalFile
    return if (file.parentFile == cache && file.name.startsWith(FILE_PREFIX) && file.name.endsWith(".wav") && file.exists()) file else null
  }

  /** Reads the RIFF header so JS can validate format, size and duration. */
  private fun wavInfo(file: File): Map<String, Any> {
    val header = ByteArray(minOf(file.length(), 4096L).toInt())
    file.inputStream().use { it.read(header) }
    fun int(offset: Int, size: Int): Long {
      var value = 0L
      for (index in 0 until size) value = value or ((header[offset + index].toLong() and 0xff) shl (8 * index))
      return value
    }
    fun tag(offset: Int) = String(header, offset, 4, Charsets.US_ASCII)
    var format = 0L; var channels = 0L; var sampleRate = 0L; var bits = 0L; var dataBytes = 0L
    val valid = header.size >= 12 && tag(0) == "RIFF" && tag(8) == "WAVE"
    var offset = 12
    while (valid && offset + 8 <= header.size) {
      val id = tag(offset)
      val size = int(offset + 4, 4)
      if (id == "fmt " && offset + 24 <= header.size) {
        format = int(offset + 8, 2); channels = int(offset + 10, 2); sampleRate = int(offset + 12, 4); bits = int(offset + 22, 2)
      }
      if (id == "data") { dataBytes = minOf(size, file.length() - offset - 8); break }
      // A malformed chunk size must not wrap around or loop forever.
      if (size > header.size - offset - 8L) break
      offset += 8 + size.toInt() + (size.toInt() and 1)
    }
    val bytesPerSecond = sampleRate * channels * (bits / 8)
    return mapOf(
      "uri" to Uri.fromFile(file).toString(),
      "path" to file.absolutePath,
      "container" to if (valid) "wav" else "unknown",
      "format" to format.toInt(),
      "sampleRate" to sampleRate.toInt(),
      "channels" to channels.toInt(),
      "bitsPerSample" to bits.toInt(),
      "dataBytes" to dataBytes.toDouble(),
      "sizeBytes" to file.length().toDouble(),
      "durationMs" to if (bytesPerSecond > 0) dataBytes * 1000.0 / bytesPerSecond else 0.0,
    )
  }

  companion object {
    private const val SAMPLE_RATE = 16_000
    private const val MAX_DURATION_MS = 120_000
    private const val FILE_PREFIX = "plutus-voice-"
  }
}
