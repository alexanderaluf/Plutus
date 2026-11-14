export type PlutusWidgetProfileChangedEvent = {
  profileId: string;
};

export type PlutusWidgetModuleEvents = {
  onWidgetProfileChanged: (params: PlutusWidgetProfileChangedEvent) => void;
};

