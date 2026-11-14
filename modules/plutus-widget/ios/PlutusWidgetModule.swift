import ExpoModulesCore
import Foundation

public class PlutusWidgetModule: Module {
  private let store = PlutusWidgetStore.shared

  public func definition() -> ModuleDefinition {
    Name("PlutusWidget")

    Events("onWidgetProfileChanged")

    AsyncFunction("setWidgetSnapshotAsync") { (snapshotJson: String) in
      self.store.writeSnapshot(snapshotJson)
    }

    AsyncFunction("consumePendingProfileIdAsync") { () -> String? in
      return self.store.consumePendingProfileId()
    }

    AsyncFunction("reloadWidgetsAsync") { () in
      self.store.reloadTimelines()
    }
  }
}

