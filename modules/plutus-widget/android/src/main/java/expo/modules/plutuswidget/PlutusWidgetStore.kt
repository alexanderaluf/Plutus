package expo.modules.plutuswidget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class ParsedWidgetLabels(
  val totalBalance: String,
  val assets: String,
  val debt: String,
  val monthlyIncome: String,
  val monthlyExpense: String,
  val createIncome: String,
  val createExpense: String,
  val noAccounts: String,
  val setupTitle: String,
  val setupSubtitle: String,
)

data class ParsedWidgetProfile(
  val id: String,
  val name: String,
  val initials: String,
  val accountCountLabel: String,
  val balanceFormatted: String,
  val assetsFormatted: String,
  val debtFormatted: String,
  val monthlyIncomeFormatted: String,
  val monthlyExpenseFormatted: String,
  val assetsRatio: Int,
  val accountsSummary: String,
)

data class ParsedWidgetSnapshot(
  val isRTL: Boolean,
  val selectedProfileId: String?,
  val labels: ParsedWidgetLabels,
  val profiles: List<ParsedWidgetProfile>,
)

object PlutusWidgetStore {
  private const val PREFS_NAME = "plutus_home_widget_v1"
  private const val KEY_SNAPSHOT = "plutus.widget.snapshot.v1"
  private const val KEY_PENDING_PROFILE_ID = "plutus.widget.pendingProfileId.v1"

  @Volatile
  var profileSwitchListener: ((String) -> Unit)? = null

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun writeSnapshot(context: Context, json: String) {
    val store = prefs(context)
    val editor = store.edit().putString(KEY_SNAPSHOT, json)
    runCatching {
      val root = JSONObject(json)
      val selectedProfileId = root.optString("selectedProfileId", "")
      val pending = store.getString(KEY_PENDING_PROFILE_ID, null)
      if (!selectedProfileId.isEmpty() && pending == selectedProfileId) {
        editor.remove(KEY_PENDING_PROFILE_ID)
      }
    }
    editor.apply()
    PlutusWidgetProvider.updateAllWidgets(context.applicationContext)
  }

  fun consumePendingProfileId(context: Context): String? {
    val store = prefs(context)
    val pending = store.getString(KEY_PENDING_PROFILE_ID, null)
    if (pending.isNullOrBlank()) return null
    store.edit().remove(KEY_PENDING_PROFILE_ID).apply()
    return pending
  }

  fun cycleToNextProfile(context: Context): String? {
    val store = prefs(context)
    val raw = store.getString(KEY_SNAPSHOT, null) ?: return null
    return runCatching {
      val root = JSONObject(raw)
      val profiles = root.optJSONArray("profiles") ?: JSONArray()
      if (profiles.length() <= 1) return null

      val currentId = root.optString("selectedProfileId", "")
      var currentIndex = 0
      for (index in 0 until profiles.length()) {
        val item = profiles.optJSONObject(index) ?: continue
        if (item.optString("id") == currentId) {
          currentIndex = index
          break
        }
      }

      val nextIndex = (currentIndex + 1) % profiles.length()
      val nextProfile = profiles.optJSONObject(nextIndex) ?: return null
      val nextId = nextProfile.optString("id", "")
      if (nextId.isBlank()) return null

      root.put("selectedProfileId", nextId)
      store
        .edit()
        .putString(KEY_SNAPSHOT, root.toString())
        .putString(KEY_PENDING_PROFILE_ID, nextId)
        .apply()

      profileSwitchListener?.invoke(nextId)
      nextId
    }.getOrNull()
  }

  fun readSnapshot(context: Context): ParsedWidgetSnapshot {
    val raw = prefs(context).getString(KEY_SNAPSHOT, null)
    if (!raw.isNullOrBlank()) {
      runCatching {
        return parseSnapshotJson(raw)
      }
    }
    return defaultSnapshot()
  }

  private fun parseSnapshotJson(raw: String): ParsedWidgetSnapshot {
    val root = JSONObject(raw)
    val labelsObj = root.optJSONObject("labels") ?: JSONObject()
    val labels = ParsedWidgetLabels(
      totalBalance = labelsObj.optString("totalBalance", "Total balance"),
      assets = labelsObj.optString("assets", "Assets"),
      debt = labelsObj.optString("debt", "Liabilities"),
      monthlyIncome = labelsObj.optString("monthlyIncome", "Month income"),
      monthlyExpense = labelsObj.optString("monthlyExpense", "Month expense"),
      createIncome = labelsObj.optString("createIncome", "Create income"),
      createExpense = labelsObj.optString("createExpense", "Create expense"),
      noAccounts = labelsObj.optString("noAccounts", "No active accounts yet"),
      setupTitle = labelsObj.optString("setupTitle", "Finish setting up Plutus"),
      setupSubtitle = labelsObj.optString(
        "setupSubtitle",
        "Open Plutus to create your profile and accounts.",
      ),
    )

    val profilesArray = root.optJSONArray("profiles") ?: JSONArray()
    val profiles = mutableListOf<ParsedWidgetProfile>()
    for (index in 0 until profilesArray.length()) {
      val item = profilesArray.optJSONObject(index) ?: continue
      profiles.add(
        ParsedWidgetProfile(
          id = item.optString("id", "profile-$index"),
          name = item.optString("name", "Profile ${index + 1}"),
          initials = item.optString("initials", "P"),
          accountCountLabel = item.optString("accountCountLabel", "0 accounts"),
          balanceFormatted = item.optString("balanceFormatted", "0.00$"),
          assetsFormatted = item.optString("assetsFormatted", "0.00$"),
          debtFormatted = item.optString("debtFormatted", "0.00$"),
          monthlyIncomeFormatted = item.optString("monthlyIncomeFormatted", "+0.00$"),
          monthlyExpenseFormatted = item.optString("monthlyExpenseFormatted", "-0.00$"),
          assetsRatio = item.optInt("assetsRatio", 100).coerceIn(0, 100),
          accountsSummary = item.optString("accountsSummary", labels.noAccounts),
        ),
      )
    }

    val selectedId = root.optString("selectedProfileId", "").ifBlank {
      profiles.firstOrNull()?.id
    }

    return ParsedWidgetSnapshot(
      isRTL = root.optBoolean("isRTL", false),
      selectedProfileId = selectedId,
      labels = labels,
      profiles = profiles,
    )
  }

  private fun defaultSnapshot(): ParsedWidgetSnapshot =
    ParsedWidgetSnapshot(
      isRTL = false,
      selectedProfileId = null,
      labels = ParsedWidgetLabels(
        totalBalance = "Total balance",
        assets = "Assets",
        debt = "Liabilities",
        monthlyIncome = "Month income",
        monthlyExpense = "Month expense",
        createIncome = "Create income",
        createExpense = "Create expense",
        noAccounts = "No active accounts yet",
        setupTitle = "Finish setting up Plutus",
        setupSubtitle = "Open Plutus to create your profile and accounts.",
      ),
      profiles = emptyList(),
    )
}

