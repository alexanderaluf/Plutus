package expo.modules.plutuslocalai

import android.app.DownloadManager
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import java.io.File
import java.io.RandomAccessFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withContext

/** The model stays in app-private storage. Chat content is never uploaded. */
class PlutusLocalAIModule : Module() {
  private var audioRecord: AudioRecord? = null
  private var recordingThread: Thread? = null
  private var recordingFile: File? = null
  @Volatile private var recording = false
  private var downloadReceiver: BroadcastReceiver? = null
  private var speechRecognizer: SpeechRecognizer? = null
  private var speechResult: CompletableDeferred<String>? = null

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
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        speechRecognizer?.cancel()
        speechRecognizer?.destroy()
        speechRecognizer = null
        speechResult?.cancel()
        speechResult = null
      }
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

    AsyncFunction("startVoiceRecognitionAsync") Coroutine { language: String ->
      withContext(Dispatchers.Main) {
        check(Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
          "On-device speech recognition is unavailable on this device"
        }
        check(speechRecognizer == null) { "Speech recognition is already running" }
        val result = CompletableDeferred<String>()
        val recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        speechResult = result
        speechRecognizer = recognizer
        recognizer.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) = Unit
          override fun onBeginningOfSpeech() = Unit
          override fun onRmsChanged(rmsdB: Float) = Unit
          override fun onBufferReceived(buffer: ByteArray?) = Unit
          override fun onEndOfSpeech() = Unit
          override fun onPartialResults(partialResults: Bundle?) = Unit
          override fun onEvent(eventType: Int, params: Bundle?) = Unit
          override fun onError(error: Int) {
            if (!result.isCompleted) result.completeExceptionally(IllegalStateException("Speech recognition failed ($error)"))
          }
          override fun onResults(results: Bundle?) {
            val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
            if (!result.isCompleted) {
              if (text.isNullOrEmpty()) result.completeExceptionally(IllegalStateException("No speech detected"))
              else result.complete(text)
            }
          }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
          putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        recognizer.startListening(intent)
      }
    }

    AsyncFunction("stopVoiceRecognitionAsync") Coroutine { ->
      val result = withContext(Dispatchers.Main) {
        val pending = checkNotNull(speechResult) { "Speech recognition is not running" }
        if (!pending.isCompleted) speechRecognizer?.stopListening()
        pending
      }
      try {
        withTimeout(20_000) { result.await() }
      } finally {
        withContext(Dispatchers.Main) {
          speechRecognizer?.destroy()
          speechRecognizer = null
          speechResult = null
        }
      }
    }

    AsyncFunction("cancelVoiceRecognitionAsync") Coroutine { ->
      withContext(Dispatchers.Main) {
        speechRecognizer?.cancel()
        speechRecognizer?.destroy()
        speechRecognizer = null
        speechResult?.cancel()
        speechResult = null
      }
    }

    AsyncFunction("startRecordingAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        check(!recording) { "Already recording" }
        val sampleRate = 16_000
        val bufferSize = maxOf(AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), 4096)
        val record = AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize)
        check(record.state == AudioRecord.STATE_INITIALIZED) { "Microphone initialization failed" }
        val file = File.createTempFile("plutus-voice-", ".wav", context.cacheDir)
        audioRecord = record
        recordingFile = file
        recording = true
        record.startRecording()
        recordingThread = Thread {
          try {
            file.outputStream().buffered().use { output ->
              output.write(ByteArray(44))
              val buffer = ByteArray(bufferSize)
              var total = 0
              while (recording && total < 16_000 * 2 * 120) {
                val count = record.read(buffer, 0, buffer.size)
                if (count > 0) { output.write(buffer, 0, count); total += count }
              }
            }
          } catch (_: Exception) { /* stopRecordingAsync reports an unusable file */ }
        }.also { it.start() }
      }
    }

    AsyncFunction("stopRecordingAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        recording = false
        audioRecord?.stop()
        recordingThread?.join(3_000)
        audioRecord?.release()
        audioRecord = null
        recordingThread = null
        val file = checkNotNull(recordingFile) { "No recording" }
        recordingFile = null
        val bytes = file.length() - 44
        check(bytes > 0 && bytes < 16_000L * 2 * 121) { "Recording is empty or too long" }
        RandomAccessFile(file, "rw").use { wav ->
          fun little(value: Int, bytesCount: Int) { repeat(bytesCount) { wav.write((value ushr (8 * it)) and 0xff) } }
          wav.seek(0)
          wav.writeBytes("RIFF"); little((bytes + 36).toInt(), 4); wav.writeBytes("WAVEfmt ")
          little(16, 4); little(1, 2); little(1, 2); little(16_000, 4)
          little(32_000, 4); little(2, 2); little(16, 2); wav.writeBytes("data"); little(bytes.toInt(), 4)
        }
        Uri.fromFile(file).toString()
      }
    }

    AsyncFunction("stopRecordingAndDeleteAsync") Coroutine { ->
      withContext(Dispatchers.IO) {
        if (recording) {
          recording = false
          audioRecord?.stop()
          recordingThread?.join(3_000)
          audioRecord?.release()
          audioRecord = null
          recordingThread = null
          recordingFile?.delete()
          recordingFile = null
        }
      }
    }
  }
}
