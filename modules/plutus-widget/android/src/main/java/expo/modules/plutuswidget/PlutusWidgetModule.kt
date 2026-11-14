package expo.modules.plutuswidget

import android.content.Context
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PlutusWidgetModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("PlutusWidget")

    Events("onWidgetProfileChanged")

    OnCreate {
      PlutusWidgetStore.profileSwitchListener = { profileId ->
        runCatching {
          sendEvent("onWidgetProfileChanged", bundleOf("profileId" to profileId))
        }
      }
    }

    OnDestroy {
      PlutusWidgetStore.profileSwitchListener = null
    }

    AsyncFunction("setWidgetSnapshotAsync") { snapshotJson: String ->
      PlutusWidgetStore.writeSnapshot(context, snapshotJson)
    }

    AsyncFunction("consumePendingProfileIdAsync") {
      PlutusWidgetStore.consumePendingProfileId(context)
    }

    AsyncFunction("reloadWidgetsAsync") {
      PlutusWidgetProvider.updateAllWidgets(context)
    }
  }
}

