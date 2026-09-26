import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

export type ThinkingStage = "thinking" | "reading" | "answering" | "transcribing";

const PHRASE_KEYS = {
  thinking: ["p1", "p2", "p3", "p4"],
  reading: ["p1", "p2", "p3", "p4", "p5"],
  answering: ["p1", "p2"],
  transcribing: ["p1", "p2"],
} as const;

/** Spinner glyphs, cycled quickly while the phrase changes more slowly. */
const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

/**
 * A live status line for the answer bubble: a cycling glyph plus a phrase
 * that describes the current stage and rotates every couple of seconds.
 */
export function ThinkingIndicator({ stage }: { stage: ThinkingStage }) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 140);
    return () => clearInterval(timer);
  }, []);
  const keys = PHRASE_KEYS[stage];
  // A new phrase every ~2.2 seconds, starting from the first of each stage.
  const key = keys[Math.floor(tick / 16) % keys.length];
  const phrase = t(`localAI.thinkingPhrases.${stage}.${key}` as "localAI.thinkingPhrases.thinking.p1");
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={phrase}
      className="flex-row items-center gap-2 self-start rounded-2xl bg-surface px-4 py-3"
    >
      <Text className="w-4 text-center font-manrope-bold text-[16px]" style={{ color: colors.accent }}>
        {GLYPHS[tick % GLYPHS.length]}
      </Text>
      <Animated.View key={`${stage}-${key}`} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)}>
        <Text className="text-[14px] text-muted">{phrase}</Text>
      </Animated.View>
    </View>
  );
}
