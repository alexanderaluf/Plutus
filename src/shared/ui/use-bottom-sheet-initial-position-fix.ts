import { useCallback, useState } from "react";
import { Platform, StyleSheet } from "react-native";

/**
 * Gorhom can briefly report an uninitialized Android position for a sheet that
 * mounts closed. Hide that closed container until the sheet reports its first
 * real snap point; subsequent close animations use Gorhom's normal positioning.
 */
export function useBottomSheetInitialPositionFix(isOpen: boolean) {
  const [hasOpened, setHasOpened] = useState(false);

  const onChange = useCallback((index: number) => {
    if (index >= 0) setHasOpened(true);
  }, []);

  return {
    containerStyle:
      Platform.OS === "android" && !isOpen && !hasOpened
        ? styles.uninitialized
        : undefined,
    onChange,
  };
}

const styles = StyleSheet.create({
  uninitialized: {
    opacity: 0,
  },
});
