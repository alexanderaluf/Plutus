import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";

import { useListEntrance } from "@/shared/ui/page-entrance";

import type { TabId } from "./types";

/**
 * Counts how many times each tab was opened from the bottom navigation. Tabs
 * stay mounted, so a tab that wants an entrance animation on every visit keys
 * its animated content on this count. Returning to a tab from a pushed screen
 * (such as account details) does not change it.
 */
export class TabEntryRegistry {
  private counts = new Map<TabId, number>();
  private times = new Map<TabId, number>();
  private listeners = new Set<() => void>();

  /** Called by the navbar just before it switches to `tabId`. */
  announce(tabId: TabId) {
    this.counts.set(tabId, (this.counts.get(tabId) ?? 0) + 1);
    this.times.set(tabId, Date.now());
    this.listeners.forEach((listener) => listener());
  }

  count(tabId: TabId) {
    return this.counts.get(tabId) ?? 0;
  }

  /** When the navbar last opened `tabId` (0 if never). */
  enteredAt(tabId: TabId) {
    return this.times.get(tabId) ?? 0;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

const TabEntryContext = createContext<TabEntryRegistry | null>(null);

export function TabEntryProvider({
  registry,
  children,
}: PropsWithChildren<{ registry: TabEntryRegistry }>) {
  return (
    <TabEntryContext.Provider value={registry}>
      {children}
    </TabEntryContext.Provider>
  );
}

export function useTabEntryRegistry() {
  const [registry] = useState(() => new TabEntryRegistry());
  return registry;
}

const noSubscription = () => () => {};

/** Changes each time the person opens `tabId` from the bottom navigation. */
export function useTabEntryKey(tabId: TabId) {
  const registry = useContext(TabEntryContext);
  return useSyncExternalStore(
    registry?.subscribe ?? noSubscription,
    () => registry?.count(tabId) ?? 0,
  );
}

/**
 * Entrance state for a tab page. Key animated views on `entryKey` so they
 * remount (and replay their entrance) on each navbar visit. `rowEntering`
 * returns an entrance only for list rows that mount as part of that visit
 * (see `useListEntrance`). `firstRowSlot` is the list position of the first
 * row after the header elements above it; a new `replayKey` replays only the
 * rows, keyed on `rowKey`, starting at `replayFirstRowSlot`.
 */
export function useTabEntrance(
  tabId: TabId,
  firstRowSlot: number,
  {
    replayKey,
    replayFirstRowSlot = 0,
  }: { replayKey?: string; replayFirstRowSlot?: number } = {},
) {
  const registry = useContext(TabEntryContext);
  const entryKey = useTabEntryKey(tabId);
  const enteredAt = useCallback(
    () => registry?.enteredAt(tabId) ?? 0,
    [registry, tabId],
  );
  // Slot 0 is the page header; list positions start after it.
  const { rowKey, rowEntering } = useListEntrance(firstRowSlot + 1, {
    replayKey,
    replayFirstRowSlot: replayFirstRowSlot + 1,
    enteredAt,
  });
  return { entryKey, rowKey: `${entryKey}:${rowKey}`, rowEntering };
}
