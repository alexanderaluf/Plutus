import Foundation
import SQLite3

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// High-speed native SQLite + lightweight per-month partition file engine.
/// Keeps only a bounded LRU window of months in memory so older history stays on flash.
final class FastStoreEngine {
  static let shared = FastStoreEngine()

  private let lock = NSLock()
  private let maxMemoryMonths = 3
  private var cachedRevision: Int64 = -1
  private var cachedCoreJson: String?
  private var cachedCatalogJson: String?
  private var cachedMonths: [String: String] = [:]
  private var monthLruOrder: [String] = []

  private lazy var indexDirectory: URL = {
    if let overridePath = ProcessInfo.processInfo.environment["PLUTUS_FAST_INDEX_DIR"],
       !overridePath.isEmpty {
      let dir = URL(fileURLWithPath: overridePath, isDirectory: true)
      try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      return dir
    }
    let base =
      FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    let dir = base.appendingPathComponent("plutus-fast-index", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }()

  private var monthsDirectory: URL {
    let dir = indexDirectory.appendingPathComponent("months", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  func resolveDatabasePath(_ providedPath: String?, dbName: String) -> String {
    if let providedPath, !providedPath.isEmpty {
      if providedPath.hasPrefix("file://"), let url = URL(string: providedPath) {
        return url.path
      }
      return providedPath
    }
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    if let docs {
      return docs.appendingPathComponent("SQLite", isDirectory: true)
        .appendingPathComponent(dbName)
        .path
    }
    return dbName
  }

  private func clampMsToInt64(_ value: Double) -> Int64? {
    guard value.isFinite else { return nil }
    let clamped = min(max(value, -8_640_000_000_000_000.0), 8_640_000_000_000_000.0)
    return Int64(clamped)
  }

  private func openReadOnlyDatabase(at path: String) -> OpaquePointer? {
    guard FileManager.default.fileExists(atPath: path) else { return nil }
    var db: OpaquePointer?
    // WAL-mode databases require -shm attachment on first open after clean writer shutdown;
    // open READWRITE (without CREATE) and immediately lock PRAGMA query_only = ON, falling back to READONLY.
    let rwFlags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_NOMUTEX
    var rc = sqlite3_open_v2(path, &db, rwFlags, nil)
    if rc != SQLITE_OK {
      if db != nil {
        sqlite3_close_v2(db)
        db = nil
      }
      let roFlags = SQLITE_OPEN_READONLY | SQLITE_OPEN_NOMUTEX
      rc = sqlite3_open_v2(path, &db, roFlags, nil)
    }
    guard rc == SQLITE_OK, let handle = db else {
      if db != nil { sqlite3_close_v2(db) }
      return nil
    }
    sqlite3_busy_timeout(handle, 2500)
    sqlite3_exec(handle, "PRAGMA query_only = ON;", nil, nil, nil)
    sqlite3_exec(handle, "PRAGMA temp_store = MEMORY;", nil, nil, nil)
    sqlite3_exec(handle, "PRAGMA mmap_size = 16777216;", nil, nil, nil)
    sqlite3_exec(handle, "PRAGMA cache_size = -4000;", nil, nil, nil)
    return handle
  }

  private func queryHeadMeta(_ db: OpaquePointer) -> (revision: Int64, updatedAt: String, coreJson: String)? {
    let sql = "SELECT revision, updated_at, core_json FROM app_meta_head WHERE id = 1 LIMIT 1;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let statement = stmt else {
      return nil
    }
    defer { sqlite3_finalize(statement) }
    guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
    let revision = sqlite3_column_int64(statement, 0)
    let updatedAt = columnText(statement, index: 1) ?? ""
    guard let coreJson = columnText(statement, index: 2) else { return nil }
    return (revision, updatedAt, coreJson)
  }

  private func queryMonthCatalogJson(_ db: OpaquePointer) -> String {
    let sql =
      "SELECT month_key, min_ts, max_ts, tx_count, summary_json FROM app_month_index ORDER BY month_key DESC;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let statement = stmt else {
      return "[]"
    }
    defer { sqlite3_finalize(statement) }

    var output = "["
    var first = true
    while sqlite3_step(statement) == SQLITE_ROW {
      guard let monthKey = columnText(statement, index: 0) else { continue }
      let minTs = sqlite3_column_int64(statement, 1)
      let maxTs = sqlite3_column_int64(statement, 2)
      let txCount = sqlite3_column_int64(statement, 3)
      let summaryJson = columnText(statement, index: 4) ?? "{}"
      if !first { output.append(",") }
      first = false
      output.append("{\"monthKey\":")
      output.append(jsonStringLiteral(monthKey))
      output.append(",\"minTs\":\(minTs),\"maxTs\":\(maxTs),\"txCount\":\(txCount),\"summary\":")
      output.append(summaryJson)
      output.append("}")
    }
    output.append("]")
    return output
  }

  private func queryMonthPayloadFromDb(_ db: OpaquePointer, monthKey: String) -> String? {
    let sql = "SELECT rows_json, summary_json, tx_count, min_ts, max_ts FROM app_month_index WHERE month_key = ? LIMIT 1;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let statement = stmt else {
      return nil
    }
    defer { sqlite3_finalize(statement) }
    sqlite3_bind_text(statement, 1, monthKey, -1, SQLITE_TRANSIENT)
    guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
    let rowsJson = columnText(statement, index: 0) ?? "[]"
    let summaryJson = columnText(statement, index: 1) ?? "{}"
    let txCount = sqlite3_column_int64(statement, 2)
    let minTs = sqlite3_column_int64(statement, 3)
    let maxTs = sqlite3_column_int64(statement, 4)
    return "{\"monthKey\":\(jsonStringLiteral(monthKey)),\"txCount\":\(txCount),\"minTs\":\(minTs),\"maxTs\":\(maxTs),\"summary\":\(summaryJson),\"rows\":\(rowsJson)}"
  }

  private func monthFileUrl(_ monthKey: String) -> URL {
    let sanitized = monthKey.replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "..", with: "_")
    return monthsDirectory.appendingPathComponent("\(sanitized).pidx")
  }

  private func headFileUrl() -> URL {
    return indexDirectory.appendingPathComponent("head.pidx")
  }

  private func touchLru(monthKey: String, payload: String, revision: Int64) {
    lock.lock()
    defer { lock.unlock() }
    if cachedRevision != revision {
      cachedRevision = revision
      cachedMonths.removeAll(keepingCapacity: true)
      monthLruOrder.removeAll(keepingCapacity: true)
      cachedCoreJson = nil
      cachedCatalogJson = nil
    }
    cachedMonths[monthKey] = payload
    monthLruOrder.removeAll { $0 == monthKey }
    monthLruOrder.append(monthKey)
    while monthLruOrder.count > maxMemoryMonths {
      let oldest = monthLruOrder.removeFirst()
      cachedMonths.removeValue(forKey: oldest)
    }
  }

  func evictColdMonths(keepMonthKeys: [String]) {
    let keep = Set(keepMonthKeys)
    lock.lock()
    defer { lock.unlock() }
    monthLruOrder.removeAll { !keep.contains($0) }
    for key in Array(cachedMonths.keys) where !keep.contains(key) {
      cachedMonths.removeValue(forKey: key)
    }
  }

  func clearAllCaches() {
    lock.lock()
    cachedRevision = -1
    cachedCoreJson = nil
    cachedCatalogJson = nil
    cachedMonths.removeAll()
    monthLruOrder.removeAll()
    lock.unlock()
    try? FileManager.default.removeItem(at: indexDirectory)
  }

  func readBootstrapSync(
    dbPath: String?,
    dbName: String,
    activeMonthKeys: [String]
  ) -> [String: Any]? {
    let path = resolveDatabasePath(dbPath, dbName: dbName)
    guard let db = openReadOnlyDatabase(at: path) else { return nil }
    defer { sqlite3_close_v2(db) }

    guard let head = queryHeadMeta(db) else { return nil }

    lock.lock()
    if cachedRevision == head.revision, let core = cachedCoreJson, let catalog = cachedCatalogJson {
      var monthPayloads: [String: String] = [:]
      var missingKeys: [String] = []
      for key in activeMonthKeys {
        if let hit = cachedMonths[key] {
          monthPayloads[key] = hit
        } else {
          missingKeys.append(key)
        }
      }
      lock.unlock()

      if missingKeys.isEmpty {
        return [
          "revision": head.revision,
          "updatedAt": head.updatedAt,
          "coreJson": core,
          "catalogJson": catalog,
          "months": monthPayloads,
          "source": "memory",
        ]
      }

      for key in missingKeys {
        if let filePayload = readMonthFileIfMatching(monthKey: key, revision: head.revision) {
          monthPayloads[key] = filePayload
          touchLru(monthKey: key, payload: filePayload, revision: head.revision)
        } else if let dbPayload = queryMonthPayloadFromDb(db, monthKey: key) {
          monthPayloads[key] = dbPayload
          touchLru(monthKey: key, payload: dbPayload, revision: head.revision)
        }
      }
      return [
        "revision": head.revision,
        "updatedAt": head.updatedAt,
        "coreJson": core,
        "catalogJson": catalog,
        "months": monthPayloads,
        "source": "sqlite+cache",
      ]
    }
    lock.unlock()

    let catalogJson = queryMonthCatalogJson(db)
    var monthPayloads: [String: String] = [:]
    for key in activeMonthKeys {
      if let filePayload = readMonthFileIfMatching(monthKey: key, revision: head.revision) {
        monthPayloads[key] = filePayload
        touchLru(monthKey: key, payload: filePayload, revision: head.revision)
      } else if let dbPayload = queryMonthPayloadFromDb(db, monthKey: key) {
        monthPayloads[key] = dbPayload
        touchLru(monthKey: key, payload: dbPayload, revision: head.revision)
      }
    }

    lock.lock()
    cachedRevision = head.revision
    cachedCoreJson = head.coreJson
    cachedCatalogJson = catalogJson
    lock.unlock()

    return [
      "revision": head.revision,
      "updatedAt": head.updatedAt,
      "coreJson": head.coreJson,
      "catalogJson": catalogJson,
      "months": monthPayloads,
      "source": "sqlite",
    ]
  }

  func readMonthSliceSync(dbPath: String?, dbName: String, monthKey: String) -> [String: Any]? {
    let path = resolveDatabasePath(dbPath, dbName: dbName)
    guard let db = openReadOnlyDatabase(at: path) else { return nil }
    defer { sqlite3_close_v2(db) }
    guard let head = queryHeadMeta(db) else { return nil }

    lock.lock()
    if cachedRevision == head.revision, let cached = cachedMonths[monthKey] {
      lock.unlock()
      return ["revision": head.revision, "monthKey": monthKey, "payloadJson": cached]
    }
    lock.unlock()

    if let filePayload = readMonthFileIfMatching(monthKey: monthKey, revision: head.revision) {
      touchLru(monthKey: monthKey, payload: filePayload, revision: head.revision)
      return ["revision": head.revision, "monthKey": monthKey, "payloadJson": filePayload]
    }

    guard let dbPayload = queryMonthPayloadFromDb(db, monthKey: monthKey) else {
      return ["revision": head.revision, "monthKey": monthKey, "payloadJson": NSNull()]
    }
    touchLru(monthKey: monthKey, payload: dbPayload, revision: head.revision)
    return ["revision": head.revision, "monthKey": monthKey, "payloadJson": dbPayload]
  }

  func queryRangeSync(
    dbPath: String?,
    dbName: String,
    startMs: Double,
    endMs: Double,
    profileId: String?,
    limit: Int
  ) -> String {
    let path = resolveDatabasePath(dbPath, dbName: dbName)
    guard let db = openReadOnlyDatabase(at: path) else { return "[]" }
    defer { sqlite3_close_v2(db) }

    let hasProfile = profileId != nil && !(profileId?.isEmpty ?? true)
    let sql = hasProfile
      ? "SELECT record_json FROM tx_month_rows WHERE timestamp_ms >= ? AND timestamp_ms < ? AND (user_id = '' OR user_id = ?) ORDER BY timestamp_ms DESC, rowid DESC LIMIT ?;"
      : "SELECT record_json FROM tx_month_rows WHERE timestamp_ms >= ? AND timestamp_ms < ? ORDER BY timestamp_ms DESC, rowid DESC LIMIT ?;"

    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let statement = stmt else {
      return "[]"
    }
    defer { sqlite3_finalize(statement) }

    guard let startInt = clampMsToInt64(startMs.rounded(.down)),
          let endInt = clampMsToInt64(endMs.rounded(.up)) else {
      return "[]"
    }
    sqlite3_bind_int64(statement, 1, startInt)
    sqlite3_bind_int64(statement, 2, endInt)
    if hasProfile, let pid = profileId {
      sqlite3_bind_text(statement, 3, pid, -1, SQLITE_TRANSIENT)
      sqlite3_bind_int(statement, 4, Int32(max(1, limit)))
    } else {
      sqlite3_bind_int(statement, 3, Int32(max(1, limit)))
    }

    var output = "["
    var first = true
    while sqlite3_step(statement) == SQLITE_ROW {
      guard let json = columnText(statement, index: 0) else { continue }
      if !first { output.append(",") }
      first = false
      output.append(json)
    }
    output.append("]")
    return output
  }

  func querySearchSync(dbPath: String?, dbName: String, options: [String: Any]) -> [String: Any] {
    let path = resolveDatabasePath(dbPath, dbName: dbName)
    guard let db = openReadOnlyDatabase(at: path) else {
      return ["totalCount": 0, "rowsJson": "[]"]
    }
    defer { sqlite3_close_v2(db) }

    var clauses: [String] = []
    var bindings: [Any] = []

    if let profileId = options["profileId"] as? String, !profileId.isEmpty {
      clauses.append("(user_id = '' OR user_id = ?)")
      bindings.append(profileId)
    }
    if let txType = options["type"] as? Int {
      clauses.append("type = ?")
      bindings.append(Int64(txType))
    }
    if let startMs = options["startMs"] as? Double,
       let startInt = clampMsToInt64(startMs.rounded(.down)) {
      clauses.append("timestamp_ms >= ?")
      bindings.append(startInt)
    }
    if let endMs = options["endMs"] as? Double,
       let endInt = clampMsToInt64(endMs.rounded(.up)) {
      clauses.append("timestamp_ms < ?")
      bindings.append(endInt)
    }
    if let minAmount = options["minAmount"] as? Double, minAmount.isFinite {
      clauses.append("amount >= ?")
      bindings.append(minAmount)
    }
    if let maxAmount = options["maxAmount"] as? Double, maxAmount.isFinite {
      clauses.append("amount <= ?")
      bindings.append(maxAmount)
    }
    if let currency = options["currencyCode"] as? String, !currency.isEmpty {
      clauses.append("currency_code = ?")
      bindings.append(currency)
    }
    if let accountIds = options["accountIds"] as? [String], !accountIds.isEmpty {
      let placeholders = Array(repeating: "?", count: accountIds.count).joined(separator: ",")
      clauses.append("account_id IN (\(placeholders))")
      for id in accountIds { bindings.append(id) }
    }
    if let categoryIds = options["categoryIds"] as? [String], !categoryIds.isEmpty {
      let placeholders = Array(repeating: "?", count: categoryIds.count).joined(separator: ",")
      clauses.append("category_id IN (\(placeholders))")
      for id in categoryIds { bindings.append(id) }
    }
    if let tokens = options["queryTokens"] as? [String], !tokens.isEmpty {
      for token in tokens where !token.isEmpty {
        clauses.append("search_text LIKE ? ESCAPE '\\'")
        bindings.append("%\(escapeLike(token))%")
      }
    }
    if let hasNote = options["hasNote"] as? Bool, hasNote {
      clauses.append("has_note = 1")
    }
    if let hasReceipt = options["hasReceipt"] as? Bool, hasReceipt {
      clauses.append("has_receipt = 1")
    }

    let whereSql = clauses.isEmpty ? "" : "WHERE " + clauses.joined(separator: " AND ")
    let sort = (options["sort"] as? String) ?? "newest"
    let orderSql: String
    switch sort {
    case "oldest": orderSql = "ORDER BY timestamp_ms ASC, rowid ASC"
    case "largest": orderSql = "ORDER BY amount DESC, timestamp_ms DESC"
    case "smallest": orderSql = "ORDER BY amount ASC, timestamp_ms DESC"
    default: orderSql = "ORDER BY timestamp_ms DESC, rowid DESC"
    }

    let limit = max(1, min((options["limit"] as? Int) ?? 60, 50000))
    let offset = max(0, (options["offset"] as? Int) ?? 0)

    let countSql = "SELECT COUNT(*) FROM tx_month_rows \(whereSql);"
    var countStmt: OpaquePointer?
    var totalCount: Int64 = 0
    if sqlite3_prepare_v2(db, countSql, -1, &countStmt, nil) == SQLITE_OK, let statement = countStmt {
      defer { sqlite3_finalize(statement) }
      bindAll(statement, bindings: bindings)
      if sqlite3_step(statement) == SQLITE_ROW {
        totalCount = sqlite3_column_int64(statement, 0)
      }
    }

    let rowsSql = "SELECT record_json FROM tx_month_rows \(whereSql) \(orderSql) LIMIT ? OFFSET ?;"
    var rowsStmt: OpaquePointer?
    var rowsOutput = "["
    var first = true
    if sqlite3_prepare_v2(db, rowsSql, -1, &rowsStmt, nil) == SQLITE_OK, let statement = rowsStmt {
      defer { sqlite3_finalize(statement) }
      var rowBindings = bindings
      rowBindings.append(Int64(limit))
      rowBindings.append(Int64(offset))
      bindAll(statement, bindings: rowBindings)
      while sqlite3_step(statement) == SQLITE_ROW {
        guard let json = columnText(statement, index: 0) else { continue }
        if !first { rowsOutput.append(",") }
        first = false
        rowsOutput.append(json)
      }
    }
    rowsOutput.append("]")
    return ["totalCount": totalCount, "rowsJson": rowsOutput]
  }

  func syncPartitionFilesSync(
    dbPath: String?,
    dbName: String,
    dirtyMonthKeys: [String]?,
    forceAll: Bool
  ) -> Int {
    let path = resolveDatabasePath(dbPath, dbName: dbName)
    guard let db = openReadOnlyDatabase(at: path) else { return 0 }
    defer { sqlite3_close_v2(db) }
    guard let head = queryHeadMeta(db) else { return 0 }

    let catalog = queryMonthCatalogJson(db)
    let headEnvelope = "{\"revision\":\(head.revision),\"updatedAt\":\(jsonStringLiteral(head.updatedAt))}"
    writeAtomic(headEnvelope, to: headFileUrl())

    lock.lock()
    cachedRevision = head.revision
    cachedCoreJson = head.coreJson
    cachedCatalogJson = catalog
    lock.unlock()

    let keysToSync: [String]
    if forceAll || dirtyMonthKeys == nil {
      keysToSync = fetchAllMonthKeys(db)
      pruneStaleMonthFiles(validKeys: Set(keysToSync))
    } else {
      keysToSync = dirtyMonthKeys ?? []
    }

    var written = 0
    for key in keysToSync {
      if let payload = queryMonthPayloadFromDb(db, monthKey: key) {
        let wrapped = "\(head.revision)\n\(payload)"
        writeAtomic(wrapped, to: monthFileUrl(key))
        lock.lock()
        let keepWarm = monthLruOrder.contains(key) || keysToSync.count <= 2
        lock.unlock()
        if keepWarm {
          touchLru(monthKey: key, payload: payload, revision: head.revision)
        }
        written += 1
      } else {
        try? FileManager.default.removeItem(at: monthFileUrl(key))
        lock.lock()
        cachedMonths.removeValue(forKey: key)
        monthLruOrder.removeAll { $0 == key }
        lock.unlock()
      }
    }
    return written
  }

  private func readMonthFileIfMatching(monthKey: String, revision: Int64) -> String? {
    let url = monthFileUrl(monthKey)
    guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
    guard let newlineIndex = raw.firstIndex(of: "\n") else { return nil }
    guard let fileRev = Int64(raw[..<newlineIndex]), fileRev == revision else { return nil }
    return String(raw[raw.index(after: newlineIndex)...])
  }

  private func fetchAllMonthKeys(_ db: OpaquePointer) -> [String] {
    let sql = "SELECT month_key FROM app_month_index;"
    var stmt: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let statement = stmt else {
      return []
    }
    defer { sqlite3_finalize(statement) }
    var keys: [String] = []
    while sqlite3_step(statement) == SQLITE_ROW {
      if let key = columnText(statement, index: 0) { keys.append(key) }
    }
    return keys
  }

  private func pruneStaleMonthFiles(validKeys: Set<String>) {
    guard let contents = try? FileManager.default.contentsOfDirectory(at: monthsDirectory, includingPropertiesForKeys: nil) else {
      return
    }
    let validFileNames = Set(validKeys.map { monthFileUrl($0).lastPathComponent })
    for url in contents where !validFileNames.contains(url.lastPathComponent) {
      try? FileManager.default.removeItem(at: url)
    }
  }

  private func writeAtomic(_ content: String, to destination: URL) {
    let tmp = destination.appendingPathExtension("tmp")
    guard let data = content.data(using: .utf8) else { return }
    do {
      try data.write(to: tmp, options: [.atomic])
      if FileManager.default.fileExists(atPath: destination.path) {
        _ = try? FileManager.default.replaceItemAt(destination, withItemAt: tmp)
      } else {
        try FileManager.default.moveItem(at: tmp, to: destination)
      }
    } catch {
      try? FileManager.default.removeItem(at: tmp)
    }
  }

  private func bindAll(_ statement: OpaquePointer, bindings: [Any]) {
    for (index, value) in bindings.enumerated() {
      let paramIndex = Int32(index + 1)
      if let intVal = value as? Int64 {
        sqlite3_bind_int64(statement, paramIndex, intVal)
      } else if let dblVal = value as? Double {
        sqlite3_bind_double(statement, paramIndex, dblVal)
      } else if let strVal = value as? String {
        sqlite3_bind_text(statement, paramIndex, strVal, -1, SQLITE_TRANSIENT)
      }
    }
  }

  private func columnText(_ statement: OpaquePointer, index: Int32) -> String? {
    guard let cString = sqlite3_column_text(statement, index) else { return nil }
    return String(cString: cString)
  }

  private func escapeLike(_ input: String) -> String {
    return input
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "%", with: "\\%")
      .replacingOccurrences(of: "_", with: "\\_")
  }

  private func jsonStringLiteral(_ value: String) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: [value], options: []),
       let encoded = String(data: data, encoding: .utf8),
       encoded.count >= 2 {
      return String(encoded.dropFirst().dropLast())
    }
    return "\"\""
  }
}
