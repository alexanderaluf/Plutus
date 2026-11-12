import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

public final class PlutusWidgetStore {
  public static let shared = PlutusWidgetStore()
  public static let appGroupIdentifier = "group.com.plutus.budgettracker"
  public static let snapshotKey = "plutus.widget.snapshot.v1"
  public static let pendingProfileIdKey = "plutus.widget.pendingProfileId.v1"

  private init() {}

  private var defaults: UserDefaults {
    UserDefaults(suiteName: Self.appGroupIdentifier) ?? .standard
  }

  public func writeSnapshot(_ json: String) {
    let store = defaults
    store.set(json, forKey: Self.snapshotKey)
    if let data = json.data(using: .utf8),
       let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let selectedProfileId = object["selectedProfileId"] as? String {
      let pending = store.string(forKey: Self.pendingProfileIdKey)
      if pending == selectedProfileId {
        store.removeObject(forKey: Self.pendingProfileIdKey)
      }
    }
    store.synchronize()
    reloadTimelines()
  }

  public func consumePendingProfileId() -> String? {
    let store = defaults
    guard let pending = store.string(forKey: Self.pendingProfileIdKey), !pending.isEmpty else {
      return nil
    }
    store.removeObject(forKey: Self.pendingProfileIdKey)
    store.synchronize()
    return pending
  }

  public func reloadTimelines() {
    #if canImport(WidgetKit) && os(iOS)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    #endif
  }
}

