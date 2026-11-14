package expo.modules.plutusfaststore

import android.content.Context
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PlutusFastStoreModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("PlutusFastStore")

    Function("readBootstrapSync") { dbPath: String?, dbName: String, activeMonthKeys: List<String> ->
      FastStoreEngine.readBootstrapSync(context, dbPath, dbName, activeMonthKeys)
    }

    Function("readMonthSliceSync") { dbPath: String?, dbName: String, monthKey: String ->
      FastStoreEngine.readMonthSliceSync(context, dbPath, dbName, monthKey)
    }

    Function("queryRangeSync") { dbPath: String?, dbName: String, startMs: Double, endMs: Double, profileId: String?, limit: Int ->
      FastStoreEngine.queryRangeSync(context, dbPath, dbName, startMs, endMs, profileId, limit)
    }

    Function("searchTransactionsSync") { dbPath: String?, dbName: String, options: Map<String, Any?> ->
      FastStoreEngine.querySearchSync(context, dbPath, dbName, options)
    }

    Function("evictColdMonthsSync") { keepMonthKeys: List<String> ->
      FastStoreEngine.evictColdMonths(keepMonthKeys)
    }

    Function("clearCacheSync") {
      FastStoreEngine.clearAllCaches(context)
    }

    AsyncFunction("syncPartitionFilesAsync") Coroutine { dbPath: String?, dbName: String, dirtyMonthKeys: List<String>?, forceAll: Boolean ->
      withContext(Dispatchers.IO) {
        FastStoreEngine.syncPartitionFiles(context, dbPath, dbName, dirtyMonthKeys, forceAll)
      }
    }
  }
}
