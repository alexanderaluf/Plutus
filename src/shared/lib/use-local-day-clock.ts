import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

import { useLocalData } from "@/data/local-data-provider";

/** A focus within this window keeps the same clock (and every cache keyed by it). */
const FOCUS_REFRESH_MS = 5 * 60_000;

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type Clock = { now: Date; document: unknown; refreshKey: unknown };

/**
 * A stable "now" for date-bounded projections.
 *
 * The Date object changes only when it must: after a data commit (so a record
 * saved a moment ago is inside `<= now` bounds), at local midnight, and on
 * focus/foreground when the day changed or the clock is older than a few
 * minutes. Rapid tab switching therefore reuses the same clock, and every
 * projection memoized on it stays cached instead of being recomputed.
 */
export function useLocalDayClock(refreshKey?: unknown) {
  const { document } = useLocalData();
  const [clock, setClock] = useState<Clock>(() => ({
    now: new Date(),
    document,
    refreshKey,
  }));
  // Adjusting state during render: the committed render already uses the new
  // clock, so a fresh save never renders once with a stale bound.
  let current = clock;
  if (clock.document !== document || clock.refreshKey !== refreshKey) {
    current = { now: new Date(), document, refreshKey };
    setClock(current);
  }

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout>;
      const update = () => {
        clearTimeout(timer);
        const time = new Date();
        setClock((previous) =>
          isSameLocalDay(previous.now, time) &&
          time.getTime() - previous.now.getTime() < FOCUS_REFRESH_MS
            ? previous
            : { ...previous, now: time },
        );
        const midnight = new Date(
          time.getFullYear(),
          time.getMonth(),
          time.getDate() + 1,
        );
        timer = setTimeout(update, midnight.getTime() - time.getTime() + 100);
      };
      update();
      const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") update();
      });
      return () => {
        clearTimeout(timer);
        listener.remove();
      };
    }, []),
  );
  return current.now;
}
