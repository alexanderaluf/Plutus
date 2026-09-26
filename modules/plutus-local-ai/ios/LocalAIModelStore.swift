import CryptoKit
import ExpoModulesCore
import Foundation
import UIKit

/// Process-wide owner of the model file. A background URLSession keeps the
/// transfer running outside the chat screen and while the app is suspended.
/// The verified model lives in Application Support/PlutusLocalAI: excluded from
/// iCloud/device backups, deleted with the app, and kept across app updates.
/// Only relative locations are derived at runtime because the container path
/// changes between app versions.
final class LocalAIModelStore: NSObject, URLSessionDownloadDelegate {
  static let shared = LocalAIModelStore()
  static let sessionIdentifier = "\(Bundle.main.bundleIdentifier ?? "plutus").local-ai-model"

  static let modelName = "gemma-4-E2B-it.litertlm"
  static let modelSize: Int64 = 2_588_147_712
  private static let modelHash = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
  private static let modelURL = URL(string: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm")!
  private static let stagedName = "\(modelName).download"
  private static let resumeName = "\(modelName).resume"
  private static let runtimeTagKey = "plutus.localAI.runtimeTag"

  /// Serializes all state; the session delegate runs on the same queue.
  private let queue = DispatchQueue(label: "plutus.local-ai.model")
  private var received: Int64 = 0
  private var verifying = false
  private var lastError: String?
  private var backgroundCompletionHandler: (() -> Void)?

  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    configuration.isDiscretionary = false
    configuration.sessionSendsLaunchEvents = true
    let delegateQueue = OperationQueue()
    delegateQueue.maxConcurrentOperationCount = 1
    delegateQueue.underlyingQueue = queue
    return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
  }()

  /// Reconnects to a transfer that continued while the app was not running.
  func activate(backgroundCompletionHandler: (() -> Void)? = nil) {
    queue.async {
      if let backgroundCompletionHandler { self.backgroundCompletionHandler = backgroundCompletionHandler }
      _ = self.session
    }
  }

  func directory() throws -> URL {
    let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    var directory = support.appendingPathComponent("PlutusLocalAI", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    return directory
  }

  func modelFile() throws -> URL { try directory().appendingPathComponent(Self.modelName) }

  func isInstalled() -> Bool {
    guard let file = try? modelFile() else { return false }
    return fileSize(file) == Self.modelSize
  }

  private func fileSize(_ file: URL) -> Int64? {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
          let size = attributes[.size] as? NSNumber else { return nil }
    return size.int64Value
  }

  /// Moves pre-release installs into the dedicated folder and drops superseded models.
  private func migrateAndClean() throws {
    let manager = FileManager.default
    let directory = try directory()
    let legacy = directory.deletingLastPathComponent().appendingPathComponent(Self.modelName)
    if manager.fileExists(atPath: legacy.path) {
      if fileSize(legacy) == Self.modelSize && !isInstalled() {
        try? manager.moveItem(at: legacy, to: try modelFile())
      }
      try? manager.removeItem(at: legacy)
    }
    for entry in (try? manager.contentsOfDirectory(atPath: directory.path)) ?? []
    where entry.hasSuffix(".litertlm") && entry != Self.modelName {
      try? manager.removeItem(at: directory.appendingPathComponent(entry))
    }
  }

  func state(_ completion: @escaping ([String: Any?]) -> Void) {
    queue.async {
      try? self.migrateAndClean()
      if self.isInstalled() { return completion(self.state("installed", Self.modelSize)) }
      if self.verifying { return completion(self.state("verifying", Self.modelSize)) }
      if let staged = try? self.directory().appendingPathComponent(Self.stagedName),
         FileManager.default.fileExists(atPath: staged.path) {
        // Downloaded, but the app stopped before verification finished.
        self.verify(staged)
        return completion(self.state("verifying", Self.modelSize))
      }
      self.session.getAllTasks { tasks in
        self.queue.async {
          if let task = tasks.first(where: { $0.state == .running || $0.state == .suspended }) {
            let received = max(self.received, task.countOfBytesReceived)
            return completion(self.state(task.state == .running ? "downloading" : "paused", received))
          }
          if let error = self.lastError {
            return completion(["status": "failed", "received": 0, "total": Self.modelSize, "error": error])
          }
          completion(self.state("idle", 0))
        }
      }
    }
  }

  private func state(_ status: String, _ received: Int64) -> [String: Any?] {
    ["status": status, "received": received, "total": Self.modelSize, "error": nil]
  }

  func start(_ completion: @escaping (Error?) -> Void) {
    state { current in
      let status = current["status"] as? String
      guard status == "idle" || status == "failed" else { return completion(nil) }
      self.queue.async {
        do {
          let resume = try self.directory().appendingPathComponent(Self.resumeName)
          let task: URLSessionDownloadTask
          if let data = try? Data(contentsOf: resume) {
            try? FileManager.default.removeItem(at: resume)
            task = self.session.downloadTask(withResumeData: data)
          } else {
            task = self.session.downloadTask(with: Self.modelURL)
          }
          task.countOfBytesClientExpectsToReceive = Self.modelSize
          self.received = 0
          self.lastError = nil
          task.resume()
          completion(nil)
        } catch {
          completion(error)
        }
      }
    }
  }

  /// Hashing a 2.6 GB file must not block the state queue.
  private func verify(_ staged: URL) {
    guard !verifying else { return }
    verifying = true
    DispatchQueue.global(qos: .utility).async {
      var failure: String?
      do {
        let handle = try FileHandle(forReadingFrom: staged)
        defer { try? handle.close() }
        var digest = SHA256()
        var size: Int64 = 0
        while let chunk = try handle.read(upToCount: 1_048_576), !chunk.isEmpty {
          digest.update(data: chunk)
          size += Int64(chunk.count)
        }
        let actual = digest.finalize().map { String(format: "%02x", $0) }.joined()
        guard size == Self.modelSize && actual == Self.modelHash else {
          throw NSError(domain: "PlutusLocalAI", code: 2, userInfo: [NSLocalizedDescriptionKey: "Model download failed verification"])
        }
        let destination = try self.modelFile()
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: staged, to: destination)
      } catch {
        try? FileManager.default.removeItem(at: staged)
        failure = error.localizedDescription
      }
      self.queue.async {
        self.lastError = failure
        self.verifying = false
      }
    }
  }

  /// LiteRT-LM writes its compiled caches next to the model. Drop them once after
  /// each app install or update so a newer runtime never reads an older cache.
  func prepareRuntime() throws {
    let info = Bundle.main.infoDictionary
    let executable = Bundle.main.executableURL.flatMap { try? FileManager.default.attributesOfItem(atPath: $0.path)[.modificationDate] as? Date }
    let tag = "\(info?["CFBundleShortVersionString"] ?? ""):\(info?["CFBundleVersion"] ?? ""):\(executable?.timeIntervalSince1970 ?? 0)"
    if UserDefaults.standard.string(forKey: Self.runtimeTagKey) == tag { return }
    try clearRuntimeCache()
    UserDefaults.standard.set(tag, forKey: Self.runtimeTagKey)
  }

  func clearRuntimeCache() throws {
    let directory = try directory()
    let keep: Set<String> = [Self.modelName, Self.stagedName, Self.resumeName]
    for entry in try FileManager.default.contentsOfDirectory(atPath: directory.path) where !keep.contains(entry) {
      try? FileManager.default.removeItem(at: directory.appendingPathComponent(entry))
    }
  }

  // MARK: - URLSessionDownloadDelegate (runs on `queue`)

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    received = totalBytesWritten
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    // The system deletes `location` when this method returns, so move it now.
    do {
      if let response = downloadTask.response as? HTTPURLResponse, !(200..<300).contains(response.statusCode) {
        throw NSError(domain: "PlutusLocalAI", code: 7, userInfo: [NSLocalizedDescriptionKey: "Model download failed (\(response.statusCode))"])
      }
      let staged = try directory().appendingPathComponent(Self.stagedName)
      try? FileManager.default.removeItem(at: staged)
      try FileManager.default.moveItem(at: location, to: staged)
      verify(staged)
    } catch {
      lastError = error.localizedDescription
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    received = 0
    guard let error else { return }
    let resumeData = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data
    if let resumeData, let resume = try? directory().appendingPathComponent(Self.resumeName) {
      try? resumeData.write(to: resume)
    }
    lastError = error.localizedDescription
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let handler = backgroundCompletionHandler
    backgroundCompletionHandler = nil
    DispatchQueue.main.async { handler?() }
  }
}

public class PlutusLocalAIAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
    guard identifier == LocalAIModelStore.sessionIdentifier else {
      // Expo waits for every subscriber; release sessions owned by other modules.
      completionHandler()
      return
    }
    LocalAIModelStore.shared.activate(backgroundCompletionHandler: completionHandler)
  }
}
