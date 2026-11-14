import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { TabId } from "./types";

type TabActionRegistry = Map<TabId, () => void>;

const TabActionContext = createContext<TabActionRegistry | null>(null);

/** Lets the mounted tab screen own what the bottom navigation action does. */
export function TabActionProvider({
  registry,
  children,
}: PropsWithChildren<{ registry: TabActionRegistry }>) {
  return (
    <TabActionContext.Provider value={registry}>
      {children}
    </TabActionContext.Provider>
  );
}

export function useTabActionRegistry() {
  const [registry] = useState<TabActionRegistry>(() => new Map());
  return registry;
}

export function useTabAction(tabId: TabId, handler: () => void) {
  const registry = useContext(TabActionContext);
  const latest = useRef(handler);

  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!registry) return;
    const run = () => latest.current();
    registry.set(tabId, run);
    return () => {
      if (registry.get(tabId) === run) registry.delete(tabId);
    };
  }, [registry, tabId]);
}
