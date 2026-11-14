import Foundation
import Security
import CryptoKit
import Darwin

/// A device-only Keychain vault and loopback OAuth callback. No financial storage.
final class ChatGPTSecurity {
  private let lock = NSLock()
  private var listener: Int32 = -1
  private var state = ""
  private var port: UInt16 = 0
  private var returnPage = ""
  private let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.plutus.budgettracker.chatgpt", kSecAttrAccount as String: "session-v1"]

  private func fail(_ code: String) -> NSError {
    NSError(domain: "PlutusChatGPT", code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }
  func read() throws -> String? {
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { throw fail("CHATGPT_STORAGE_INVALID") }
    return value
  }
  func write(_ value: String) throws {
    let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      guard SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) == errSecSuccess else { throw fail("CHATGPT_STORAGE_INVALID") }
    } else if status != errSecSuccess { throw fail("CHATGPT_STORAGE_INVALID") }
  }
  func random() throws -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw fail("CHATGPT_RANDOM_FAILED") }
    return encode(Data(bytes))
  }
  func digest(_ value: String) -> String { encode(Data(SHA256.hash(data: Data(value.utf8)))) }

  /// The page shown after sign-in; it opens `returnUrl` (the app's own deep link) to hand control back.
  private static func makeReturnPage(_ returnUrl: String, _ title: String, _ message: String, _ action: String) -> String {
    func escape(_ value: String) -> String {
      value.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&#39;")
    }
    let scheme = returnUrl.components(separatedBy: "://").first ?? ""
    let safe = returnUrl.contains("://") && scheme != "http" && scheme != "https" &&
      returnUrl.range(of: "^[a-z][a-z0-9+.-]*://[A-Za-z0-9/_.-]*$", options: .regularExpression) != nil
    let link = safe ? escape(returnUrl) : nil
    let refresh = link.map { "<meta http-equiv=\"refresh\" content=\"0;url=\($0)\">" } ?? ""
    let button = link.map { "<a href=\"\($0)\">\(escape(action.isEmpty ? "Open Plutus" : action))</a>" } ?? ""
    return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\(refresh)" +
      "<title>Plutus</title><style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;margin:40px 24px;color:#17201b;background:#dce7e0}" +
      "a{display:inline-block;margin-top:12px;padding:14px 24px;border-radius:16px;background:#17201b;color:#fff;text-decoration:none;font-weight:600}" +
      "@media(prefers-color-scheme:dark){body{color:#e8efea;background:#101512}a{background:#e8efea;color:#101512}}</style></head>" +
      "<body><h2>\(escape(title.isEmpty ? "Return to Plutus" : title))</h2><p>\(escape(message))</p>\(button)</body></html>"
  }

  func start(_ expectedState: String, _ returnUrl: String, _ title: String, _ message: String, _ action: String) throws -> String {
    lock.lock(); defer { lock.unlock() }
    guard listener == -1 else { throw fail("CHATGPT_SIGNIN_BUSY") }
    let fd = Darwin.socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else { throw fail("CHATGPT_LISTENER_FAILED") }
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = 0
    address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let bound = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
    }
    guard bound == 0, Darwin.listen(fd, 4) == 0 else { Darwin.close(fd); throw fail("CHATGPT_LISTENER_FAILED") }
    var size = socklen_t(MemoryLayout<sockaddr_in>.size)
    let named = withUnsafeMutablePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &size) }
    }
    guard named == 0 else { Darwin.close(fd); throw fail("CHATGPT_LISTENER_FAILED") }
    listener = fd; state = expectedState; port = UInt16(bigEndian: address.sin_port)
    returnPage = Self.makeReturnPage(returnUrl, title, message, action)
    return "http://127.0.0.1:\(port)/auth/callback"
  }
  func cancel() {
    lock.lock(); defer { lock.unlock() }
    if listener >= 0 { shutdown(listener, SHUT_RDWR); Darwin.close(listener); listener = -1 }
  }
  func waitForCallback() throws -> String {
    lock.lock(); let fd = listener; let expectedState = state; let localPort = port; let page = returnPage; lock.unlock()
    guard fd >= 0 else { throw fail("CHATGPT_SIGNIN_CANCELLED") }
    defer { lock.lock(); if listener == fd { Darwin.close(fd); listener = -1 }; lock.unlock() }
    let deadline = Date().addingTimeInterval(300)
    while Date() < deadline {
      var pollDescriptor = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
      guard poll(&pollDescriptor, 1, 1000) >= 0 else { throw fail("CHATGPT_LISTENER_FAILED") }
      lock.lock(); let cancelled = listener != fd; lock.unlock()
      if cancelled { throw fail("CHATGPT_SIGNIN_CANCELLED") }
      if pollDescriptor.revents & Int16(POLLIN) == 0 { continue }
      let client = Darwin.accept(fd, nil, nil)
      if client < 0 { continue }
      defer { Darwin.close(client) }
      var timeout = timeval(tv_sec: 3, tv_usec: 0)
      setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
      var noSignal: Int32 = 1
      setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
      // Read the whole header block: closing with unread input can reset the connection.
      var bytes = [UInt8]()
      while bytes.count < 16384 && !bytes.suffix(4).elementsEqual([13, 10, 13, 10]) && !bytes.suffix(2).elementsEqual([10, 10]) {
        var byte: UInt8 = 0
        if Darwin.recv(client, &byte, 1, 0) != 1 { break }
        bytes.append(byte)
      }
      let line = String(decoding: bytes, as: UTF8.self).components(separatedBy: .newlines).first ?? ""
      let parts = line.split(separator: " ")
      let target = parts.count > 1 ? String(parts[1]) : ""
      let callback = "http://127.0.0.1:\(localPort)\(target)"
      let components = URLComponents(string: callback)
      let valid = line.hasPrefix("GET ") && components?.path == "/auth/callback" &&
        components?.queryItems?.first(where: { $0.name == "state" })?.value == expectedState
      let body = valid ? page : "Invalid callback"
      let response = "HTTP/1.1 \(valid ? "200 OK" : "400 Bad Request")\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\nContent-Length: \(body.utf8.count)\r\n\r\n\(body)"
      _ = response.withCString { Darwin.send(client, $0, response.utf8.count, 0) }
      if valid { return callback }
    }
    throw fail("CHATGPT_SIGNIN_TIMEOUT")
  }

  func verify(_ token: String, _ jwks: String, _ clientId: String, _ nonce: String) throws -> [String: String] {
    let parts = token.components(separatedBy: ".")
    guard parts.count == 3,
      let header = try JSONSerialization.jsonObject(with: decode(parts[0])) as? [String: Any], header["alg"] as? String == "RS256",
      let kid = header["kid"] as? String, !kid.isEmpty,
      let document = try JSONSerialization.jsonObject(with: Data(jwks.utf8)) as? [String: Any],
      let keys = document["keys"] as? [[String: Any]],
      let jwk = keys.first(where: { $0["kid"] as? String == kid && $0["kty"] as? String == "RSA" }),
      let n = jwk["n"] as? String, let e = jwk["e"] as? String else { throw fail("CHATGPT_IDENTITY_INVALID") }
    let der = asn1(0x30, asn1Integer(try decode(n)) + asn1Integer(try decode(e)))
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateWithData(der as CFData, [kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic] as CFDictionary, &error),
      SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, Data("\(parts[0]).\(parts[1])".utf8) as CFData, try decode(parts[2]) as CFData, &error),
      let claims = try JSONSerialization.jsonObject(with: decode(parts[1])) as? [String: Any],
      claims["iss"] as? String == "https://auth.openai.com", claims["nonce"] as? String == nonce,
      let exp = claims["exp"] as? Double, exp > Date().timeIntervalSince1970,
      let subject = claims["sub"] as? String, !subject.isEmpty else { throw fail("CHATGPT_IDENTITY_INVALID") }
    let audience = claims["aud"] as? [String] ?? [claims["aud"] as? String ?? ""]
    guard audience.contains(clientId), audience.count == 1 || claims["azp"] as? String == clientId else { throw fail("CHATGPT_IDENTITY_INVALID") }
    return ["subject": subject, "email": claims["email"] as? String ?? ""]
  }
  private func encode(_ value: Data) -> String { value.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
  private func decode(_ value: String) throws -> Data {
    var base = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    base += String(repeating: "=", count: (4 - base.count % 4) % 4)
    guard let bytes = Data(base64Encoded: base) else { throw fail("CHATGPT_IDENTITY_INVALID") }; return bytes
  }
  private func asn1(_ tag: UInt8, _ value: Data) -> Data {
    let length = value.count
    let prefix: [UInt8] = length < 128 ? [UInt8(length)] : length < 256 ? [0x81, UInt8(length)] : [0x82, UInt8(length >> 8), UInt8(length & 255)]
    return Data([tag] + prefix) + value
  }
  private func asn1Integer(_ value: Data) -> Data { asn1(0x02, value.first.map { $0 >= 128 } == true ? Data([0]) + value : value) }
}
