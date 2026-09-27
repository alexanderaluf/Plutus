import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

export const GREETING_KEYS = [
  "morning",
  "afternoon",
  "evening",
  "night",
] as const;
export type GreetingKey = (typeof GREETING_KEYS)[number];

export function greetingKeyFor(date: Date): GreetingKey {
  const hour = date.getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

/** Recompute on entry, foreground, and each hour so the greeting never goes stale. */
export function useTimeOfDayGreeting() {
  const [greeting, setGreeting] = useState(() => greetingKeyFor(new Date()));

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setTimeout>;
      const update = () => {
        clearTimeout(timer);
        const current = new Date();
        setGreeting(greetingKeyFor(current));
        const nextHour = new Date(current);
        nextHour.setHours(current.getHours() + 1, 0, 0, 0);
        timer = setTimeout(update, nextHour.getTime() - current.getTime() + 100);
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

  return greeting;
}
