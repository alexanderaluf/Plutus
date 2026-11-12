package expo.modules.plutuswidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.View
import android.widget.RemoteViews

class PlutusWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    val snapshot = PlutusWidgetStore.readSnapshot(context)
    for (appWidgetId in appWidgetIds) {
      updateWidget(context, appWidgetManager, appWidgetId, snapshot)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_SWITCH_PROFILE) {
      PlutusWidgetStore.cycleToNextProfile(context)
      updateAllWidgets(context)
    }
  }

  companion object {
    const val ACTION_SWITCH_PROFILE = "com.plutus.budgettracker.widget.ACTION_SWITCH_PROFILE"
    private const val REQUEST_OPEN_OVERVIEW = 4100
    private const val REQUEST_CREATE_INCOME = 4101
    private const val REQUEST_CREATE_EXPENSE = 4102
    private const val REQUEST_SWITCH_PROFILE = 4103

    fun updateAllWidgets(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, PlutusWidgetProvider::class.java)
      val ids = manager.getAppWidgetIds(component)
      if (ids.isEmpty()) return
      val snapshot = PlutusWidgetStore.readSnapshot(context)
      for (id in ids) {
        updateWidget(context, manager, id, snapshot)
      }
    }

    private fun pendingFlags(): Int {
      var flags = PendingIntent.FLAG_UPDATE_CURRENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags = flags or PendingIntent.FLAG_IMMUTABLE
      }
      return flags
    }

    private fun deepLinkPendingIntent(
      context: Context,
      requestCode: Int,
      uriString: String,
    ): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uriString)).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      return PendingIntent.getActivity(context, requestCode, intent, pendingFlags())
    }

    private fun switchProfilePendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, PlutusWidgetProvider::class.java).apply {
        action = ACTION_SWITCH_PROFILE
      }
      return PendingIntent.getBroadcast(context, REQUEST_SWITCH_PROFILE, intent, pendingFlags())
    }

    private fun updateWidget(
      context: Context,
      manager: AppWidgetManager,
      appWidgetId: Int,
      snapshot: ParsedWidgetSnapshot,
    ) {
      val views = RemoteViews(context.packageName, R.layout.plutus_widget)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
        views.setInt(
          R.id.plutus_widget_root,
          "setLayoutDirection",
          if (snapshot.isRTL) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR,
        )
      }

      val activeProfile = snapshot.profiles.firstOrNull {
        it.id == snapshot.selectedProfileId
      } ?: snapshot.profiles.firstOrNull()

      views.setTextViewText(R.id.plutus_widget_title, snapshot.labels.totalBalance)
      views.setTextViewText(R.id.plutus_widget_income_label, snapshot.labels.monthlyIncome)
      views.setTextViewText(R.id.plutus_widget_expense_label, snapshot.labels.monthlyExpense)
      views.setTextViewText(
        R.id.plutus_widget_btn_income_text,
        "+ ${snapshot.labels.createIncome}",
      )
      views.setTextViewText(
        R.id.plutus_widget_btn_expense_text,
        "− ${snapshot.labels.createExpense}",
      )

      if (activeProfile == null) {
        views.setTextViewText(R.id.plutus_widget_account_count, "")
        views.setTextViewText(R.id.plutus_widget_profile_name, "Plutus")
        views.setTextViewText(R.id.plutus_widget_balance, snapshot.labels.setupTitle)
        views.setTextViewText(R.id.plutus_widget_assets_text, snapshot.labels.setupSubtitle)
        views.setTextViewText(R.id.plutus_widget_debt_text, "")
        views.setProgressBar(R.id.plutus_widget_assets_bar, 100, 100, false)
        views.setTextViewText(R.id.plutus_widget_income_value, "—")
        views.setTextViewText(R.id.plutus_widget_expense_value, "—")
        views.setTextViewText(R.id.plutus_widget_accounts_summary, snapshot.labels.noAccounts)

        val openAppIntent = deepLinkPendingIntent(context, REQUEST_OPEN_OVERVIEW, "plutus:///")
        views.setOnClickPendingIntent(R.id.plutus_widget_card, openAppIntent)
        views.setOnClickPendingIntent(R.id.plutus_widget_profile_button, openAppIntent)
        views.setOnClickPendingIntent(R.id.plutus_widget_btn_income, openAppIntent)
        views.setOnClickPendingIntent(R.id.plutus_widget_btn_expense, openAppIntent)
        manager.updateAppWidget(appWidgetId, views)
        return
      }

      val hasMultipleProfiles = snapshot.profiles.size > 1
      val profilePillText =
        if (hasMultipleProfiles) "${activeProfile.name} ▾" else activeProfile.name

      views.setTextViewText(R.id.plutus_widget_account_count, activeProfile.accountCountLabel)
      views.setTextViewText(R.id.plutus_widget_profile_name, profilePillText)
      views.setTextViewText(R.id.plutus_widget_balance, activeProfile.balanceFormatted)
      views.setTextViewText(
        R.id.plutus_widget_assets_text,
        "${snapshot.labels.assets}: ${activeProfile.assetsFormatted}",
      )
      views.setTextViewText(
        R.id.plutus_widget_debt_text,
        "${snapshot.labels.debt}: ${activeProfile.debtFormatted}",
      )
      views.setProgressBar(R.id.plutus_widget_assets_bar, 100, activeProfile.assetsRatio, false)
      views.setTextViewText(
        R.id.plutus_widget_income_value,
        activeProfile.monthlyIncomeFormatted,
      )
      views.setTextViewText(
        R.id.plutus_widget_expense_value,
        activeProfile.monthlyExpenseFormatted,
      )
      views.setTextViewText(
        R.id.plutus_widget_accounts_summary,
        activeProfile.accountsSummary,
      )

      val encodedProfileId = Uri.encode(activeProfile.id)
      val openOverviewIntent = deepLinkPendingIntent(
        context,
        REQUEST_OPEN_OVERVIEW,
        "plutus:///(tabs)/accounts?profileId=$encodedProfileId",
      )
      val createIncomeIntent = deepLinkPendingIntent(
        context,
        REQUEST_CREATE_INCOME,
        "plutus:///transactions/create?type=income&profileId=$encodedProfileId",
      )
      val createExpenseIntent = deepLinkPendingIntent(
        context,
        REQUEST_CREATE_EXPENSE,
        "plutus:///transactions/create?type=expense&profileId=$encodedProfileId",
      )

      views.setOnClickPendingIntent(R.id.plutus_widget_card, openOverviewIntent)
      views.setOnClickPendingIntent(R.id.plutus_widget_inner_card, openOverviewIntent)
      views.setOnClickPendingIntent(R.id.plutus_widget_btn_income, createIncomeIntent)
      views.setOnClickPendingIntent(R.id.plutus_widget_btn_expense, createExpenseIntent)

      if (hasMultipleProfiles) {
        views.setOnClickPendingIntent(
          R.id.plutus_widget_profile_button,
          switchProfilePendingIntent(context),
        )
      } else {
        views.setOnClickPendingIntent(R.id.plutus_widget_profile_button, openOverviewIntent)
      }

      manager.updateAppWidget(appWidgetId, views)
    }
  }
}

