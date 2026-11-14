import ExpoModulesCore
import Foundation

public class PlutusFastStoreModule: Module {
  private let engine = FastStoreEngine.shared

  public func definition() -> ModuleDefinition {
    Name("PlutusFastStore")

    Function("readBootstrapSync") { (dbPath: String?, dbName: String, activeMonthKeys: [String]) -> [String: Any]? in
      return self.engine.readBootstrapSync(dbPath: dbPath, dbName: dbName, activeMonthKeys: activeMonthKeys)
    }

    Function("readMonthSliceSync") { (dbPath: String?, dbName: String, monthKey: String) -> [String: Any]? in
      return self.engine.readMonthSliceSync(dbPath: dbPath, dbName: dbName, monthKey: monthKey)
    }

    Function("queryRangeSync") { (dbPath: String?, dbName: String, startMs: Double, endMs: Double, profileId: String?, limit: Int) -> String in
      return self.engine.queryRangeSync(
        dbPath: dbPath,
        dbName: dbName,
        startMs: startMs,
        endMs: endMs,
        profileId: profileId,
        limit: limit
      )
    }

    Function("searchTransactionsSync") { (dbPath: String?, dbName: String, options: [String: Any]) -> [String: Any] in
      return self.engine.querySearchSync(dbPath: dbPath, dbName: dbName, options: options)
    }

    Function("evictColdMonthsSync") { (keepMonthKeys: [String]) in
      self.engine.evictColdMonths(keepMonthKeys: keepMonthKeys)
    }

    Function("clearCacheSync") {
      self.engine.clearAllCaches()
    }

    AsyncFunction("syncPartitionFilesAsync") { (dbPath: String?, dbName: String, dirtyMonthKeys: [String]?, forceAll: Bool, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        let count = self.engine.syncPartitionFilesSync(
          dbPath: dbPath,
          dbName: dbName,
          dirtyMonthKeys: dirtyMonthKeys,
          forceAll: forceAll
        )
        promise.resolve(count)
      }
    }
  }
}
