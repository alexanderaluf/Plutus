import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

// Recompute on entry, foreground, midnight, and optionally after a data commit.
export function useLocalDayClock(refreshKey?: unknown) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout>;
      const update = () => {
        clearTimeout(timer);
        const current = new Date();
        setNow(current);
        const midnight = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() + 1,
        );
        timer = setTimeout(
          update,
          midnight.getTime() - current.getTime() + 100,
        );
      };
      update();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") update();
      });
      return () => {
        clearTimeout(timer);
        listener.remove();
      };
      // This is an intentional invalidation key, not a value read by the timer.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]),
  );
  return now;
}
