import ExpoModulesCore
import Foundation
import AVFoundation
import Speech
import Darwin

public class PlutusLocalAIModule: Module {
  private var recorder: AVAudioRecorder?
  private var recordingURL: URL?
  private var speechTask: SFSpeechRecognitionTask?
  private let store = LocalAIModelStore.shared

  public func definition() -> ModuleDefinition {
    Name("PlutusLocalAI")

    OnCreate { self.store.activate() }
    OnDestroy { self.speechTask?.cancel(); self.speechTask = nil }

    AsyncFunction("isInstalledAsync") { () -> Bool in self.store.isInstalled() }

    AsyncFunction("getDownloadStateAsync") { (promise: Promise) in
      self.store.state { state in promise.resolve(state.mapValues { $0 ?? NSNull() }) }
    }

    AsyncFunction("downloadAsync") { (promise: Promise) in
      self.store.start { error in
        if let error { promise.reject(error) } else { promise.resolve() }
      }
    }

    AsyncFunction("getModelPathAsync") { () throws -> String in
      guard self.store.isInstalled() else { throw NSError(domain: "PlutusLocalAI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Model is not installed"]) }
      try self.store.prepareRuntime()
      return try self.store.modelFile().path
    }

    AsyncFunction("getAvailableMemoryAsync") { () -> Double in
      Double(os_proc_available_memory())
    }

    AsyncFunction("clearRuntimeCacheAsync") { () throws in try self.store.clearRuntimeCache() }

    AsyncFunction("cancelVoiceRecognitionAsync") { () in
      self.speechTask?.cancel()
      self.speechTask = nil
    }

    AsyncFunction("transcribeRecordingAsync") { (uri: String, language: String, promise: Promise) in
      guard let url = URL(string: uri), url.isFileURL else {
        promise.reject("VOICE_FILE", "Invalid voice recording")
        return
      }
      let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
      guard let recognizer, recognizer.isAvailable, recognizer.supportsOnDeviceRecognition else {
        promise.reject("VOICE_UNAVAILABLE", "On-device speech recognition is unavailable for this language")
        return
      }
      SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else {
          promise.reject("VOICE_PERMISSION", "Speech recognition permission was denied")
          return
        }
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        var finished = false
        self.speechTask = recognizer.recognitionTask(with: request) { result, error in
          guard !finished else { return }
          if let error {
            finished = true
            self.speechTask = nil
            promise.reject("VOICE_FAILED", error.localizedDescription)
          } else if let result, result.isFinal {
            finished = true
            self.speechTask = nil
            let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { promise.reject("VOICE_EMPTY", "No speech detected") }
            else { promise.resolve(text) }
          }
        }
      }
    }

    AsyncFunction("startRecordingAsync") { () throws in
      guard self.recorder == nil else { throw NSError(domain: "PlutusLocalAI", code: 3, userInfo: [NSLocalizedDescriptionKey: "Already recording"]) }
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      try session.setActive(true)
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("plutus-voice-\(UUID().uuidString).wav")
      let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsFloatKey: false]
      let recorder = try AVAudioRecorder(url: file, settings: settings)
      guard recorder.record(forDuration: 120) else { throw NSError(domain: "PlutusLocalAI", code: 4, userInfo: [NSLocalizedDescriptionKey: "Could not start recording"]) }
      self.recorder = recorder
      self.recordingURL = file
    }

    AsyncFunction("stopRecordingAsync") { () throws -> String in
      guard let recorder = self.recorder, let file = self.recordingURL else { throw NSError(domain: "PlutusLocalAI", code: 5, userInfo: [NSLocalizedDescriptionKey: "No recording"]) }
      recorder.stop()
      self.recorder = nil
      self.recordingURL = nil
      guard (self.fileSize(file) ?? 0) > 44 else {
        try? FileManager.default.removeItem(at: file)
        throw NSError(domain: "PlutusLocalAI", code: 6, userInfo: [NSLocalizedDescriptionKey: "Recording is empty"])
      }
      return file.absoluteString
    }

    AsyncFunction("stopRecordingAndDeleteAsync") { () in
      self.recorder?.stop()
      self.recorder = nil
      if let file = self.recordingURL { try? FileManager.default.removeItem(at: file) }
      self.recordingURL = nil
    }
  }
}
