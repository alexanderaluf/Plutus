package expo.modules.plutusfaststore

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.util.LinkedHashMap

/**
 * High-speed Android native SQLite reader and bounded LRU per-month partition file engine.
 * Keeps at most a few active months hot in native RAM so older history stays on flash.
 */
object FastStoreEngine {
  private const val MAX_MEMORY_MONTHS = 3
  private const val MAX_MMAP_BYTES = 16777216L

  private val lock = Any()
  private var cachedRevision: Long = -1L
  private var cachedCoreJson: String? = null
  private var cachedCatalogJson: String? = null
  private val cachedMonths = LinkedHashMap<String, String>(8, 0.75f, true)

  private fun indexDirectory(context: Context): File {
    val dir = File(context.filesDir, "plutus-fast-index")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun monthsDirectory(context: Context): File {
    val dir = File(indexDirectory(context), "months")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun headFile(context: Context): File = File(indexDirectory(context), "head.pidx")

  private fun monthFile(context: Context, monthKey: String): File {
    val safeName = monthKey.replace("/", "_").replace("..", "_")
    return File(monthsDirectory(context), "$safeName.pidx")
  }

  fun resolveDatabasePath(context: Context, providedPath: String?, dbName: String): String {
    if (!providedPath.isNullOrEmpty()) {
      if (providedPath.startsWith("file://")) {
        return runCatching { java.net.URI(providedPath).path }.getOrNull() ?: providedPath
      }
      return providedPath
    }
    return File(File(context.filesDir.canonicalPath, "SQLite"), dbName).absolutePath
  }

  private fun openReadOnlyDatabase(path: String): SQLiteDatabase? {
    val file = File(path)
    if (!file.exists()) return null
    val noLocalized = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      SQLiteDatabase.NO_LOCALIZED_COLLATORS
    } else {
      0
    }
    val db = runCatching {
      // WAL databases need -shm attachment after a clean shutdown; open READWRITE and lock query_only.
      SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE or noLocalized)
    }.getOrElse {
      runCatching {
        SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY or noLocalized)
      }.getOrNull()
    } ?: return null

    return try {
      runCatching {
        db.rawQuery("PRAGMA busy_timeout = 2500", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA query_only = ON", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA temp_store = MEMORY", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA cache_size = -4000", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA mmap_size = $MAX_MMAP_BYTES", null).use { it.moveToFirst() }
      }
      db
    } catch (_: Throwable) {
      runCatching { db.close() }
      null
    }
  }

  private data class HeadMeta(
    val revision: Long,
    val updatedAt: String,
    val coreJson: String,
  )

  private fun queryHeadMeta(db: SQLiteDatabase): HeadMeta? {
    return try {
      db.rawQuery("SELECT revision, updated_at, core_json FROM app_meta_head WHERE id = 1 LIMIT 1", null).use { cursor ->
        if (!cursor.moveToFirst()) return null
        val revision = cursor.getLong(0)
        val updatedAt = cursor.getString(1) ?: ""
        val coreJson = cursor.getString(2) ?: return null
        HeadMeta(revision, updatedAt, coreJson)
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun queryMonthCatalogJson(db: SQLiteDatabase): String {
    return try {
      db.rawQuery(
        "SELECT month_key, min_ts, max_ts, tx_count, summary_json FROM app_month_index ORDER BY month_key DESC",
        null
      ).use { cursor ->
        val sb = StringBuilder(256)
        sb.append('[')
        var first = true
        while (cursor.moveToNext()) {
          val monthKey = cursor.getString(0) ?: continue
          val minTs = cursor.getLong(1)
          val maxTs = cursor.getLong(2)
          val txCount = cursor.getLong(3)
          val summaryJson = cursor.getString(4) ?: "{}"
          if (!first) sb.append(',')
          first = false
          sb.append("{\"monthKey\":").append(JSONObject.quote(monthKey))
            .append(",\"minTs\":").append(minTs)
            .append(",\"maxTs\":").append(maxTs)
            .append(",\"txCount\":").append(txCount)
            .append(",\"summary\":").append(summaryJson)
            .append('}')
        }
        sb.append(']')
        sb.toString()
      }
    } catch (_: Throwable) {
      "[]"
    }
  }

  private fun queryMonthPayloadFromDb(db: SQLiteDatabase, monthKey: String): String? {
    return try {
      db.rawQuery(
        "SELECT rows_json, summary_json, tx_count, min_ts, max_ts FROM app_month_index WHERE month_key = ? LIMIT 1",
        arrayOf(monthKey)
      ).use { cursor ->
        if (!cursor.moveToFirst()) return null
        val rowsJson = cursor.getString(0) ?: "[]"
        val summaryJson = cursor.getString(1) ?: "{}"
        val txCount = cursor.getLong(2)
        val minTs = cursor.getLong(3)
        val maxTs = cursor.getLong(4)
        val sb = StringBuilder(rowsJson.length + summaryJson.length + 128)
        sb.append("{\"monthKey\":").append(JSONObject.quote(monthKey))
          .append(",\"txCount\":").append(txCount)
          .append(",\"minTs\":").append(minTs)
          .append(",\"maxTs\":").append(maxTs)
          .append(",\"summary\":").append(summaryJson)
          .append(",\"rows\":").append(rowsJson)
          .append('}')
        sb.toString()
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun touchLru(monthKey: String, payload: String, revision: Long) {
    synchronized(lock) {
      if (cachedRevision != revision) {
        cachedRevision = revision
        cachedMonths.clear()
        cachedCoreJson = null
        cachedCatalogJson = null
      }
      cachedMonths[monthKey] = payload
      while (cachedMonths.size > MAX_MEMORY_MONTHS) {
        val eldest = cachedMonths.entries.iterator().next().key
        cachedMonths.remove(eldest)
      }
    }
  }

  private fun readMonthFileIfMatching(context: Context, monthKey: String, revision: Long): String? {
    val file = monthFile(context, monthKey)
    if (!file.exists()) return null
    return try {
      val text = file.readText(Charsets.UTF_8)
      val newline = text.indexOf('\n')
      if (newline <= 0) return null
      val fileRev = text.substring(0, newline).toLongOrNull() ?: return null
      if (fileRev != revision) return null
      text.substring(newline + 1)
    } catch (_: Throwable) {
      null
    }
  }

  fun readBootstrapSync(
    context: Context,
    dbPath: String?,
    dbName: String,
    activeMonthKeys: List<String>
  ): Map<String, Any?>? {
    val path = resolveDatabasePath(context, dbPath, dbName)
    val db = openReadOnlyDatabase(path) ?: return null
    try {
      val head = queryHeadMeta(db) ?: return null
      var hitMemory: Map<String, String>? = null
      var cachedCore: String? = null
      var cachedCatalog: String? = null
      val missingKeys = mutableListOf<String>()

      synchronized(lock) {
        if (cachedRevision == head.revision && cachedCoreJson != null && cachedCatalogJson != null) {
          cachedCore = cachedCoreJson
          cachedCatalog = cachedCatalogJson
          val map = HashMap<String, String>()
          for (key in activeMonthKeys) {
            val hit = cachedMonths[key]
            if (hit != null) map[key] = hit else missingKeys.add(key)
          }
          hitMemory = map
        }
      }

      if (hitMemory != null && cachedCore != null && cachedCatalog != null) {
        val months = HashMap(hitMemory!!)
        var source = "memory"
        if (missingKeys.isNotEmpty()) {
          source = "sqlite+cache"
          for (key in missingKeys) {
            val payload = readMonthFileIfMatching(context, key, head.revision)
              ?: queryMonthPayloadFromDb(db, key)
            if (payload != null) {
              months[key] = payload
              touchLru(key, payload, head.revision)
            }
          }
        }
        return mapOf(
          "revision" to head.revision.toDouble(),
          "updatedAt" to head.updatedAt,
          "coreJson" to cachedCore!!,
          "catalogJson" to cachedCatalog!!,
          "months" to months,
          "source" to source
        )
      }

      val catalogJson = queryMonthCatalogJson(db)
      val months = HashMap<String, String>()
      for (key in activeMonthKeys) {
        val payload = readMonthFileIfMatching(context, key, head.revision)
          ?: queryMonthPayloadFromDb(db, key)
        if (payload != null) {
          months[key] = payload
          touchLru(key, payload, head.revision)
        }
      }

      synchronized(lock) {
        cachedRevision = head.revision
        cachedCoreJson = head.coreJson
        cachedCatalogJson = catalogJson
      }

      return mapOf(
        "revision" to head.revision.toDouble(),
        "updatedAt" to head.updatedAt,
        "coreJson" to head.coreJson,
        "catalogJson" to catalogJson,
        "months" to months,
        "source" to "sqlite"
      )
    } finally {
      db.close()
    }
  }

  fun readMonthSliceSync(
    context: Context,
    dbPath: String?,
    dbName: String,
    monthKey: String
  ): Map<String, Any?>? {
    val path = resolveDatabasePath(context, dbPath, dbName)
    val db = openReadOnlyDatabase(path) ?: return null
    try {
      val head = queryHeadMeta(db) ?: return null
      synchronized(lock) {
        if (cachedRevision == head.revision) {
          val hit = cachedMonths[monthKey]
          if (hit != null) {
            return mapOf(
              "revision" to head.revision.toDouble(),
              "monthKey" to monthKey,
              "payloadJson" to hit
            )
          }
        }
      }
      val payload = readMonthFileIfMatching(context, monthKey, head.revision)
        ?: queryMonthPayloadFromDb(db, monthKey)
      if (payload != null) {
        touchLru(monthKey, payload, head.revision)
      }
      return mapOf(
        "revision" to head.revision.toDouble(),
        "monthKey" to monthKey,
        "payloadJson" to payload
      )
    } finally {
      db.close()
    }
  }

  fun queryRangeSync(
    context: Context,
    dbPath: String?,
    dbName: String,
    startMs: Double,
    endMs: Double,
    profileId: String?,
    limit: Int
  ): String {
    if (!startMs.isFinite() || !endMs.isFinite()) return "[]"
    val path = resolveDatabasePath(context, dbPath, dbName)
    val db = openReadOnlyDatabase(path) ?: return "[]"
    try {
      val start = kotlin.math.floor(startMs).toLong()
      val end = kotlin.math.ceil(endMs).toLong()
      val safeLimit = limit.coerceIn(1, 50000)
      val hasProfile = !profileId.isNullOrEmpty()
      val sql = if (hasProfile) {
        "SELECT record_json FROM tx_month_rows WHERE timestamp_ms >= $start AND timestamp_ms < $end AND (user_id = '' OR user_id = ?) ORDER BY timestamp_ms DESC, rowid DESC LIMIT $safeLimit"
      } else {
        "SELECT record_json FROM tx_month_rows WHERE timestamp_ms >= $start AND timestamp_ms < $end ORDER BY timestamp_ms DESC, rowid DESC LIMIT $safeLimit"
      }
      val args = if (hasProfile) arrayOf(profileId!!) else null
      return db.rawQuery(sql, args).use { cursor ->
        val sb = StringBuilder(4096)
        sb.append('[')
        var first = true
        while (cursor.moveToNext()) {
          val json = cursor.getString(0) ?: continue
          if (!first) sb.append(',')
          first = false
          sb.append(json)
        }
        sb.append(']')
        sb.toString()
      }
    } catch (_: Throwable) {
      return "[]"
    } finally {
      db.close()
    }
  }

  fun querySearchSync(
    context: Context,
    dbPath: String?,
    dbName: String,
    options: Map<String, Any?>
  ): Map<String, Any> {
    val path = resolveDatabasePath(context, dbPath, dbName)
    val db = openReadOnlyDatabase(path) ?: return mapOf("totalCount" to 0, "rowsJson" to "[]")
    try {
      val clauses = mutableListOf<String>()
      val args = mutableListOf<String>()

      val profileId = options["profileId"] as? String
      if (!profileId.isNullOrEmpty()) {
        clauses.add("(user_id = '' OR user_id = ?)")
        args.add(profileId)
      }
      (options["type"] as? Number)?.let {
        clauses.add("type = ${it.toInt()}")
      }
      (options["startMs"] as? Number)?.let { value ->
        val d = value.toDouble()
        if (d.isFinite()) clauses.add("timestamp_ms >= ${kotlin.math.floor(d).toLong()}")
      }
      (options["endMs"] as? Number)?.let { value ->
        val d = value.toDouble()
        if (d.isFinite()) clauses.add("timestamp_ms < ${kotlin.math.ceil(d).toLong()}")
      }
      (options["minAmount"] as? Number)?.let { value ->
        val d = value.toDouble()
        if (d.isFinite()) clauses.add("amount >= $d")
      }
      (options["maxAmount"] as? Number)?.let { value ->
        val d = value.toDouble()
        if (d.isFinite()) clauses.add("amount <= $d")
      }
      val currency = options["currencyCode"] as? String
      if (!currency.isNullOrEmpty()) {
        clauses.add("currency_code = ?")
        args.add(currency)
      }
      @Suppress("UNCHECKED_CAST")
      val accountIds = (options["accountIds"] as? List<*>)?.filterIsInstance<String>()
      if (!accountIds.isNullOrEmpty()) {
        val placeholders = accountIds.joinToString(",") { "?" }
        clauses.add("account_id IN ($placeholders)")
        args.addAll(accountIds)
      }
      @Suppress("UNCHECKED_CAST")
      val categoryIds = (options["categoryIds"] as? List<*>)?.filterIsInstance<String>()
      if (!categoryIds.isNullOrEmpty()) {
        val placeholders = categoryIds.joinToString(",") { "?" }
        clauses.add("category_id IN ($placeholders)")
        args.addAll(categoryIds)
      }
      @Suppress("UNCHECKED_CAST")
      val tokens = (options["queryTokens"] as? List<*>)?.filterIsInstance<String>()
      if (!tokens.isNullOrEmpty()) {
        for (token in tokens) {
          if (token.isNotEmpty()) {
            clauses.add("search_text LIKE ? ESCAPE '\\'")
            args.add("%${escapeLike(token)}%")
          }
        }
      }
      if (options["hasNote"] == true) {
        clauses.add("has_note = 1")
      }
      if (options["hasReceipt"] == true) {
        clauses.add("has_receipt = 1")
      }

      val whereSql = if (clauses.isEmpty()) "" else "WHERE ${clauses.joinToString(" AND ")}"
      val orderSql = when (options["sort"] as? String ?: "newest") {
        "oldest" -> "ORDER BY timestamp_ms ASC, rowid ASC"
        "largest" -> "ORDER BY amount DESC, timestamp_ms DESC"
        "smallest" -> "ORDER BY amount ASC, timestamp_ms DESC"
        else -> "ORDER BY timestamp_ms DESC, rowid DESC"
      }
      val limit = ((options["limit"] as? Number)?.toInt() ?: 60).coerceIn(1, 50000)
      val offset = ((options["offset"] as? Number)?.toInt() ?: 0).coerceAtLeast(0)
      val selectionArgs = if (args.isEmpty()) null else args.toTypedArray()

      var totalCount = 0L
      db.rawQuery("SELECT COUNT(*) FROM tx_month_rows $whereSql", selectionArgs).use { cursor ->
        if (cursor.moveToFirst()) totalCount = cursor.getLong(0)
      }

      val rowsJson = db.rawQuery(
        "SELECT record_json FROM tx_month_rows $whereSql $orderSql LIMIT $limit OFFSET $offset",
        selectionArgs
      ).use { cursor ->
        val sb = StringBuilder(4096)
        sb.append('[')
        var first = true
        while (cursor.moveToNext()) {
          val json = cursor.getString(0) ?: continue
          if (!first) sb.append(',')
          first = false
          sb.append(json)
        }
        sb.append(']')
        sb.toString()
      }

      return mapOf("totalCount" to totalCount.toDouble(), "rowsJson" to rowsJson)
    } catch (_: Throwable) {
      return mapOf("totalCount" to 0, "rowsJson" to "[]")
    } finally {
      db.close()
    }
  }

  fun syncPartitionFiles(
    context: Context,
    dbPath: String?,
    dbName: String,
    dirtyMonthKeys: List<String>?,
    forceAll: Boolean
  ): Int {
    val path = resolveDatabasePath(context, dbPath, dbName)
    val db = openReadOnlyDatabase(path) ?: return 0
    try {
      val head = queryHeadMeta(db) ?: return 0
      val catalog = queryMonthCatalogJson(db)
      writeAtomic(headFile(context), "{\"revision\":${head.revision},\"updatedAt\":${JSONObject.quote(head.updatedAt)}}")

      synchronized(lock) {
        cachedRevision = head.revision
        cachedCoreJson = head.coreJson
        cachedCatalogJson = catalog
      }

      val keysToSync = if (forceAll || dirtyMonthKeys == null) {
        fetchAllMonthKeys(db).also { pruneStaleMonthFiles(context, it.toSet()) }
      } else {
        dirtyMonthKeys
      }

      var written = 0
      for (key in keysToSync) {
        val payload = queryMonthPayloadFromDb(db, key)
        val file = monthFile(context, key)
        if (payload != null) {
          writeAtomic(file, "${head.revision}\n$payload")
          val keepWarm = synchronized(lock) {
            cachedMonths.containsKey(key) || keysToSync.size <= 2
          }
          if (keepWarm) touchLru(key, payload, head.revision)
          written++
        } else {
          runCatching { file.delete() }
          synchronized(lock) { cachedMonths.remove(key) }
        }
      }
      return written
    } finally {
      db.close()
    }
  }

  fun evictColdMonths(keepMonthKeys: List<String>) {
    val keep = keepMonthKeys.toSet()
    synchronized(lock) {
      val iterator = cachedMonths.keys.iterator()
      while (iterator.hasNext()) {
        if (!keep.contains(iterator.next())) iterator.remove()
      }
    }
  }

  fun clearAllCaches(context: Context) {
    synchronized(lock) {
      cachedRevision = -1L
      cachedCoreJson = null
      cachedCatalogJson = null
      cachedMonths.clear()
    }
    runCatching { indexDirectory(context).deleteRecursively() }
  }

  private fun fetchAllMonthKeys(db: SQLiteDatabase): List<String> {
    val keys = mutableListOf<String>()
    runCatching {
      db.rawQuery("SELECT month_key FROM app_month_index", null).use { cursor ->
        while (cursor.moveToNext()) {
          cursor.getString(0)?.let { keys.add(it) }
        }
      }
    }
    return keys
  }

  private fun pruneStaleMonthFiles(context: Context, validKeys: Set<String>) {
    val dir = monthsDirectory(context)
    val validNames = validKeys.map { monthFile(context, it).name }.toSet()
    dir.listFiles()?.forEach { file ->
      if (!validNames.contains(file.name)) {
        runCatching { file.delete() }
      }
    }
  }

  private fun writeAtomic(destination: File, content: String) {
    val tmp = File(destination.parentFile, "${destination.name}.tmp")
    runCatching {
      tmp.writeText(content, Charsets.UTF_8)
      if (!tmp.renameTo(destination)) {
        destination.writeText(content, Charsets.UTF_8)
        tmp.delete()
      }
    }.onFailure {
      runCatching { tmp.delete() }
    }
  }

  private fun escapeLike(input: String): String {
    return input.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
  }
}
