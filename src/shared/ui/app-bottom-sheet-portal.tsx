import {
  BottomSheet,
  PortalHost,
  type BottomSheetPortalProps,
} from "heroui-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { StyleSheet, View } from "react-native";

/**
 * A dedicated host for HeroUI bottom sheets. Its elevation is only active
 * while a sheet is open, so closed sheet containers cannot interfere with
 * BlurView or Reanimated layers used by the app's selectors.
 */
export const APP_BOTTOM_SHEET_PORTAL_HOST = "app-bottom-sheet-portal";

type PortalLayerContextValue = {
  isSheetOpen: boolean;
  setSheetOpen: (id: string, isOpen: boolean) => void;
};

const PortalLayerContext = createContext<PortalLayerContextValue | null>(null);

export function AppBottomSheetPortalLayer({ children }: PropsWithChildren) {
  const [openSheetIds, setOpenSheetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const setSheetOpen = useCallback((id: string, isOpen: boolean) => {
    setOpenSheetIds((current) => {
      if (current.has(id) === isOpen) return current;
      const next = new Set(current);
      if (isOpen) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({ isSheetOpen: openSheetIds.size > 0, setSheetOpen }),
    [openSheetIds.size, setSheetOpen],
  );

  return (
    <PortalLayerContext.Provider value={value}>
      {children}
    </PortalLayerContext.Provider>
  );
}

function usePortalLayer() {
  const context = useContext(PortalLayerContext);
  if (!context) {
    throw new Error(
      "AppBottomSheetPortal must render under AppBottomSheetPortalLayer.",
    );
  }
  return context;
}

export function AppBottomSheetPortalHost() {
  const { isSheetOpen } = usePortalLayer();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, isSheetOpen && styles.activeHost]}
    >
      <PortalHost name={APP_BOTTOM_SHEET_PORTAL_HOST} />
    </View>
  );
}

type AppBottomSheetPortalProps = Omit<BottomSheetPortalProps, "hostName"> & {
  isOpen: boolean;
};

/** Routes a sheet through the shared host and raises it only while it is open. */
export function AppBottomSheetPortal({
  isOpen,
  ...props
}: AppBottomSheetPortalProps) {
  const { setSheetOpen } = usePortalLayer();
  const id = useId();

  useEffect(() => {
    setSheetOpen(id, isOpen);
    return () => setSheetOpen(id, false);
  }, [id, isOpen, setSheetOpen]);

  return (
    <BottomSheet.Portal hostName={APP_BOTTOM_SHEET_PORTAL_HOST} {...props} />
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  activeHost: {
    elevation: 1000,
    zIndex: 1000,
  },
});
