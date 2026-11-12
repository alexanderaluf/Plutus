import { NativeModule, requireOptionalNativeModule } from "expo";

import type { PlutusWidgetModuleEvents } from "./PlutusWidget.types";

declare class PlutusWidgetModule extends NativeModule<PlutusWidgetModuleEvents> {
  /** Writes the serialized read-only widget snapshot and refreshes home-screen widgets. */
  setWidgetSnapshotAsync(snapshotJson: string): Promise<void>;
  /** Returns and clears any profile ID selected directly from a home-screen widget. */
  consumePendingProfileIdAsync(): Promise<string | null>;
  /** Triggers a timeline/widget reload on iOS WidgetKit and Android AppWidgetManager. */
  reloadWidgetsAsync(): Promise<void>;
}

export default requireOptionalNativeModule<PlutusWidgetModule>("PlutusWidget");

