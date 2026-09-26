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

    AsyncFunction("startRecordingAsync") { (maxDurationMs: Int) throws in
      guard self.recorder == nil else { throw NSError(domain: "PlutusLocalAI", code: 3, userInfo: [NSLocalizedDescriptionKey: "Already recording"]) }
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth])
      try session.setActive(true)
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(Self.filePrefix)\(UUID().uuidString).wav")
      // Gemma 4 audio input expects 16 kHz mono signed 16-bit PCM.
      let settings: [String: Any] = [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsFloatKey: false]
      let recorder = try AVAudioRecorder(url: file, settings: settings)
      recorder.isMeteringEnabled = true
      let seconds = Double(max(1_000, min(maxDurationMs, 120_000))) / 1_000
      guard recorder.record(forDuration: seconds) else {
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        throw NSError(domain: "PlutusLocalAI", code: 4, userInfo: [NSLocalizedDescriptionKey: "AUDIO_RECORD_FAILED: could not start recording"])
      }
      self.recorder = recorder
      self.recordingURL = file
    }

    AsyncFunction("getRecordingLevelAsync") { () -> Double in
      guard let recorder = self.recorder, recorder.isRecording else { return 0 }
      recorder.updateMeters()
      // Decibels (-160...0) to a 0...1 display level.
      return pow(10, Double(recorder.averagePower(forChannel: 0)) / 20)
    }

    AsyncFunction("stopRecordingAsync") { () throws -> [String: Any] in
      guard let recorder = self.recorder, let file = self.recordingURL else { throw NSError(domain: "PlutusLocalAI", code: 5, userInfo: [NSLocalizedDescriptionKey: "AUDIO_RECORD_FAILED: no recording"]) }
      recorder.stop()
      self.recorder = nil
      self.recordingURL = nil
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      guard (self.fileSize(file) ?? 0) > 44 else {
        try? FileManager.default.removeItem(at: file)
        throw NSError(domain: "PlutusLocalAI", code: 6, userInfo: [NSLocalizedDescriptionKey: "AUDIO_EMPTY: nothing was recorded"])
      }
      return self.wavInfo(file)
    }

    AsyncFunction("stopRecordingAndDeleteAsync") { () in
      self.recorder?.stop()
      self.recorder = nil
      if let file = self.recordingURL { try? FileManager.default.removeItem(at: file) }
      self.recordingURL = nil
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    AsyncFunction("deleteRecordingAsync") { (path: String) -> Bool in
      guard let file = self.ownedRecording(path) else { return false }
      return (try? FileManager.default.removeItem(at: file)) != nil
    }

    AsyncFunction("inspectRecordingAsync") { (path: String) throws -> [String: Any] in
      guard let file = self.ownedRecording(path) else {
        throw NSError(domain: "PlutusLocalAI", code: 7, userInfo: [NSLocalizedDescriptionKey: "AUDIO_FORMAT_INVALID: not an app recording"])
      }
      return self.wavInfo(file)
    }
  }

  private static let filePrefix = "plutus-voice-"

  private func fileSize(_ file: URL) -> Int? {
    (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue
  }

  /// Only temporary voice files created by this module may be read or deleted.
  private func ownedRecording(_ path: String) -> URL? {
    let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
    guard let file = url?.standardizedFileURL.resolvingSymlinksInPath() else { return nil }
    let directory = FileManager.default.temporaryDirectory.standardizedFileURL.resolvingSymlinksInPath()
    guard file.deletingLastPathComponent().path == directory.path,
          file.lastPathComponent.hasPrefix(Self.filePrefix),
          file.pathExtension == "wav",
          FileManager.default.fileExists(atPath: file.path) else { return nil }
    return file
  }

  /// Reads the RIFF header (AVAudioRecorder may add an FLLR chunk before data).
  private func wavInfo(_ file: URL) -> [String: Any] {
    let size = fileSize(file) ?? 0
    let header = (try? FileHandle(forReadingFrom: file)).map { handle -> Data in
      defer { try? handle.close() }
      return handle.readData(ofLength: 4096)
    } ?? Data()
    let bytes = [UInt8](header)
    func int(_ offset: Int, _ count: Int) -> Int {
      guard offset + count <= bytes.count else { return 0 }
      var value = 0
      for index in 0..<count { value |= Int(bytes[offset + index]) << (8 * index) }
      return value
    }
    func tag(_ offset: Int) -> String {
      guard offset + 4 <= bytes.count else { return "" }
      return String(bytes: bytes[offset..<offset + 4], encoding: .ascii) ?? ""
    }
    var format = 0, channels = 0, sampleRate = 0, bits = 0, dataBytes = 0
    let valid = tag(0) == "RIFF" && tag(8) == "WAVE"
    var offset = 12
    while valid && offset + 8 <= bytes.count {
      let id = tag(offset)
      let chunk = int(offset + 4, 4)
      if id == "fmt " {
        format = int(offset + 8, 2); channels = int(offset + 10, 2); sampleRate = int(offset + 12, 4); bits = int(offset + 22, 2)
      }
      if id == "data" { dataBytes = min(chunk, size - offset - 8); break }
      offset += 8 + chunk + (chunk & 1)
    }
    let bytesPerSecond = sampleRate * channels * (bits / 8)
    return [
      "uri": file.absoluteString,
      "path": file.path,
      "container": valid ? "wav" : "unknown",
      "format": format,
      "sampleRate": sampleRate,
      "channels": channels,
      "bitsPerSample": bits,
      "dataBytes": Double(dataBytes),
      "sizeBytes": Double(size),
      "durationMs": bytesPerSecond > 0 ? Double(dataBytes) * 1000 / Double(bytesPerSecond) : 0,
    ]
  }
}
