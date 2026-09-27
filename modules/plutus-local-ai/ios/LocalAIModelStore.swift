import CryptoKit
import ExpoModulesCore
import Foundation
import UIKit

/// Owns independent background downloads and verified app-private model files.
final class LocalAIModelStore: NSObject, URLSessionDownloadDelegate {
  static let shared = LocalAIModelStore()
  static let sessionIdentifier = "\(Bundle.main.bundleIdentifier ?? "plutus").local-ai-model"

  private struct Model {
    let key: String
    let name: String
    let size: Int64
    let hash: String
    let url: URL
  }
  private static let models: [String: Model] = [
    "E2B": Model(key: "E2B", name: "gemma-4-E2B-it.litertlm", size: 2_588_147_712,
      hash: "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c",
      url: URL(string: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm")!),
    "E4B": Model(key: "E4B", name: "gemma-4-E4B-it.litertlm", size: 3_659_530_240,
      hash: "0b2a8980ce155fd97673d8e820b4d29d9c7d99b8fa6806f425d969b145bd52e0",
      url: URL(string: "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/28299f3/gemma-4-E4B-it.litertlm")!),
  ]
  private static let runtimeTagKey = "plutus.localAI.runtimeTag"
  private let queue = DispatchQueue(label: "plutus.local-ai.model")
  private var received: [String: Int64] = [:]
  private var verifying: Set<String> = []
  private var errors: [String: String] = [:]
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

  private func model(_ key: String) throws -> Model {
    guard let model = Self.models[key] else { throw NSError(domain: "PlutusLocalAI", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unknown local AI model"]) }
    return model
  }
  func modelFile(_ key: String) throws -> URL { try directory().appendingPathComponent(model(key).name) }
  private func stagedFile(_ key: String) throws -> URL { try directory().appendingPathComponent(model(key).name + ".download") }
  private func resumeFile(_ key: String) throws -> URL { try directory().appendingPathComponent(model(key).name + ".resume") }
  private func fileSize(_ file: URL) -> Int64? {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: file.path),
          let size = attributes[.size] as? NSNumber else { return nil }
    return size.int64Value
  }
  func isInstalled(_ key: String) -> Bool {
    guard let spec = try? model(key), let file = try? modelFile(key) else { return false }
    return fileSize(file) == spec.size
  }

  private func migrateLegacy() {
    guard let spec = Self.models["E2B"], let destination = try? modelFile("E2B") else { return }
    let legacy = destination.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent(spec.name)
    if FileManager.default.fileExists(atPath: legacy.path) {
      if fileSize(legacy) == spec.size && !isInstalled("E2B") { try? FileManager.default.moveItem(at: legacy, to: destination) }
      try? FileManager.default.removeItem(at: legacy)
    }
  }

  func state(_ key: String, _ completion: @escaping ([String: Any?]) -> Void) {
    queue.async { self.stateOnQueue(key, completion) }
  }

  private func stateOnQueue(_ key: String, _ completion: @escaping ([String: Any?]) -> Void) {
    guard let spec = try? model(key) else {
      completion(["status": "failed", "error": "Unknown local AI model"])
      return
    }
    migrateLegacy()
    if isInstalled(key) {
      completion(state("installed", spec.size, spec.size))
      return
    }
    if verifying.contains(key) {
      completion(state("verifying", spec.size, spec.size))
      return
    }
    if let staged = try? stagedFile(key), FileManager.default.fileExists(atPath: staged.path) {
      verify(staged, spec)
      completion(state("verifying", spec.size, spec.size))
      return
    }
    session.getAllTasks { tasks in
      self.queue.async { self.stateFromTasks(key, spec, tasks, completion) }
    }
  }

  private func stateFromTasks(_ key: String, _ spec: Model, _ tasks: [URLSessionTask], _ completion: @escaping ([String: Any?]) -> Void) {
    for task in tasks where self.key(for: task) == key {
      if task.state == .running || task.state == .suspended {
        let count = max(received[key] ?? 0, task.countOfBytesReceived)
        completion(state(task.state == .running ? "downloading" : "paused", count, spec.size))
        return
      }
    }
    if let error = errors[key] {
      completion(state("failed", 0, spec.size, error))
    } else {
      completion(state("idle", 0, spec.size))
    }
  }
  private func state(_ status: String, _ received: Int64, _ size: Int64, _ error: String? = nil) -> [String: Any?] {
    ["status": status, "received": received, "total": size, "error": error]
  }
  private func key(for task: URLSessionTask) -> String? {
    if let key = task.taskDescription, Self.models[key] != nil { return key }
    // Existing E2B downloads made before this version have no description.
    if task.originalRequest?.url?.absoluteString.contains("gemma-4-E2B-it") == true { return "E2B" }
    if task.originalRequest?.url?.absoluteString.contains("gemma-4-E4B-it") == true { return "E4B" }
    return nil
  }

  func start(_ key: String, _ completion: @escaping (Error?) -> Void) {
    state(key) { current in
      let status = current["status"] as? String
      guard status == "idle" || status == "failed" else { return completion(nil) }
      self.queue.async {
        do {
          let spec = try self.model(key)
          let resume = try self.resumeFile(key)
          let task: URLSessionDownloadTask
          if let data = try? Data(contentsOf: resume) {
            try? FileManager.default.removeItem(at: resume)
            task = self.session.downloadTask(withResumeData: data)
          } else { task = self.session.downloadTask(with: spec.url) }
          task.taskDescription = key
          task.countOfBytesClientExpectsToReceive = spec.size
          self.received[key] = 0
          self.errors.removeValue(forKey: key)
          task.resume()
          completion(nil)
        } catch { completion(error) }
      }
    }
  }

  private func verify(_ staged: URL, _ spec: Model) {
    guard !verifying.contains(spec.key) else { return }
    verifying.insert(spec.key)
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
        guard size == spec.size && actual == spec.hash else {
          throw NSError(domain: "PlutusLocalAI", code: 2, userInfo: [NSLocalizedDescriptionKey: "Model download failed verification"])
        }
        let destination = try self.modelFile(spec.key)
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: staged, to: destination)
      } catch {
        try? FileManager.default.removeItem(at: staged)
        failure = error.localizedDescription
      }
      self.queue.async {
        self.errors[spec.key] = failure
        self.verifying.remove(spec.key)
      }
    }
  }

  func delete(_ key: String, _ completion: @escaping (Error?) -> Void) {
    queue.async {
      do {
        _ = try self.model(key)
        guard !self.verifying.contains(key) else { throw NSError(domain: "PlutusLocalAI", code: 3, userInfo: [NSLocalizedDescriptionKey: "Model is being verified"]) }
        self.session.getAllTasks { tasks in
          self.queue.async {
            tasks.filter { self.key(for: $0) == key }.forEach { $0.cancel() }
            do {
              for file in [try self.modelFile(key), try self.stagedFile(key), try self.resumeFile(key)] {
                if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
              }
              self.errors.removeValue(forKey: key)
              try self.clearRuntimeCache(key)
              completion(nil)
            } catch { completion(error) }
          }
        }
      } catch { completion(error) }
    }
  }

  func prepareRuntime() throws {
    let info = Bundle.main.infoDictionary
    let executable = Bundle.main.executableURL.flatMap { try? FileManager.default.attributesOfItem(atPath: $0.path)[.modificationDate] as? Date }
    let tag = "\(info?["CFBundleShortVersionString"] ?? ""):\(info?["CFBundleVersion"] ?? ""):\(executable?.timeIntervalSince1970 ?? 0)"
    if UserDefaults.standard.string(forKey: Self.runtimeTagKey) == tag { return }
    try clearRuntimeCache()
    UserDefaults.standard.set(tag, forKey: Self.runtimeTagKey)
  }

  func clearRuntimeCache(_ key: String? = nil) throws {
    let directory = try directory()
    let keep = Set(Self.models.values.flatMap { [$0.name, $0.name + ".download", $0.name + ".resume"] })
    for entry in try FileManager.default.contentsOfDirectory(atPath: directory.path) where !keep.contains(entry) {
      if key == nil || entry.hasPrefix("gemma-4-\(key!)-it") { try? FileManager.default.removeItem(at: directory.appendingPathComponent(entry)) }
    }
  }

  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    if let key = key(for: downloadTask) { received[key] = totalBytesWritten }
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
    guard let key = key(for: downloadTask), let spec = Self.models[key] else { return }
    do {
      if let response = downloadTask.response as? HTTPURLResponse, !(200..<300).contains(response.statusCode) {
        throw NSError(domain: "PlutusLocalAI", code: 7, userInfo: [NSLocalizedDescriptionKey: "Model download failed (\(response.statusCode))"])
      }
      let staged = try stagedFile(key)
      try? FileManager.default.removeItem(at: staged)
      try FileManager.default.moveItem(at: location, to: staged)
      verify(staged, spec)
    } catch { errors[key] = error.localizedDescription }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let key = key(for: task) else { return }
    received[key] = 0
    guard let error else { return }
    if (error as NSError).code == NSURLErrorCancelled { return }
    if let resumeData = (error as NSError).userInfo[NSURLSessionDownloadTaskResumeData] as? Data,
       let resume = try? resumeFile(key) { try? resumeData.write(to: resume) }
    errors[key] = error.localizedDescription
  }
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    let handler = backgroundCompletionHandler
    backgroundCompletionHandler = nil
    DispatchQueue.main.async { handler?() }
  }
}

public class PlutusLocalAIAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
    guard identifier == LocalAIModelStore.sessionIdentifier else { completionHandler(); return }
    LocalAIModelStore.shared.activate(backgroundCompletionHandler: completionHandler)
  }
}
