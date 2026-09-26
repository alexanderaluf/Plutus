import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { WAVE_BARS } from "../voice/use-voice-input";
import type { VoiceState } from "../voice/voice-state";

function clock(totalSeconds: number) {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** Elapsed recording seconds, updated a few times per second. */
function useElapsedSeconds(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}

/**
 * A scrolling sound wave from recent microphone levels (newest on the end
 * side); no audio samples are kept in JS.
 */
function SoundWave({ levels, bars }: { levels: number[]; bars: number }) {
  const colors = useAppThemeColors();
  const padded = [...Array(Math.max(0, bars - levels.length)).fill(0), ...levels.slice(-bars)];
  return (
    <View className="h-9 flex-1 flex-row items-center justify-between" style={{ gap: 2 }}>
      {padded.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            maxWidth: 4,
            borderRadius: 2,
            backgroundColor: value > 0 ? colors.danger : colors.border,
            // Speech levels are small; lift them so quiet talk is visible.
            height: 3 + Math.round(Math.min(1, Math.sqrt(value) * 1.6) * 30),
          }}
        />
      ))}
    </View>
  );
}

/** Keyboard height tracked on the UI thread; works with Android edge-to-edge. */
export function useChatKeyboard() {
  return useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
}

/**
 * A floating message box that rides on top of the software keyboard, so the
 * draft stays visible while typing on both Android and iOS.
 */
export function ChatComposer({
  keyboard,
  bottomInset,
  draft,
  onChangeDraft,
  onSend,
  onOpenCommands,
  inputRef,
  voice,
  levels,
  maxSeconds,
  voiceAvailable,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  ready,
  busy,
  onLayoutHeight,
}: {
  keyboard: ReturnType<typeof useChatKeyboard>;
  bottomInset: number;
  draft: string;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  /** Opens the "/" menu of everything the assistant can do. */
  onOpenCommands: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  voice: VoiceState;
  /** Recent microphone levels (0…1), oldest first. */
  levels: number[];
  /** Recording stops automatically at this length. */
  maxSeconds: number;
  /** False when the loaded engine has no audio backend. */
  voiceAvailable: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  ready: boolean;
  busy: boolean;
  onLayoutHeight: (height: number) => void;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const floating = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -Math.max(keyboard.height.value - bottomInset, 0),
      },
    ],
  }));
  const recording = voice.type === "recording";
  const processing =
    voice.type === "finalizing" ||
    voice.type === "validating_audio" ||
    voice.type === "transcribing" ||
    voice.type === "requesting_permission";
  const elapsed = Math.min(useElapsedSeconds(recording ? voice.startedAt : null), maxSeconds);
  const nearLimit = maxSeconds - elapsed <= 10;
  const canSend = ready && !busy && !recording && !processing && !!draft.trim();
  const micDisabled = !ready || busy || processing || !voiceAvailable;

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={({ nativeEvent }) => onLayoutHeight(nativeEvent.layout.height)}
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: bottomInset + 8,
          paddingHorizontal: 12,
          zIndex: 30,
        },
        floating,
      ]}
    >
      <View
        className="rounded-[28px] border border-border bg-surface px-2 pb-2 pt-1"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
        }}
      >
        {recording || processing ? (
          recording ? (
            <View
              className="min-h-11 flex-row items-center gap-3 px-3 py-2"
              accessibilityRole="timer"
              accessibilityLabel={t("localAI.recordingTime", { elapsed: clock(elapsed), limit: clock(maxSeconds) })}
            >
              <View className="size-2.5 rounded-full bg-danger" />
              <SoundWave levels={levels} bars={WAVE_BARS} />
              <Text
                className="font-manrope-semibold text-[15px]"
                style={{ color: nearLimit ? colors.danger : colors.foreground, fontVariant: ["tabular-nums"] }}
              >
                {`${clock(elapsed)} / ${clock(maxSeconds)}`}
              </Text>
            </View>
          ) : (
            <View className="min-h-11 flex-row items-center gap-3 px-3 py-2.5">
              <ActivityIndicator size="small" />
              <Text className="flex-1 text-base text-foreground">
                {voice.type === "transcribing" ? t("localAI.transcribing") : t("localAI.preparingAudio")}
              </Text>
            </View>
          )
        ) : (
          <TextInput
            ref={inputRef}
            accessibilityLabel={t("localAI.messagePlaceholder")}
            placeholder={t("localAI.messagePlaceholder")}
            value={draft}
            onChangeText={(value) => {
              // Typing "/" into an empty box opens the command menu.
              if (value === "/" && !draft) {
                onOpenCommands();
                return;
              }
              onChangeDraft(value);
            }}
            multiline
            editable={ready && !busy}
            className="max-h-32 min-h-11 px-3 py-2.5 text-base text-foreground"
            placeholderTextColor={colors.muted}
            cursorColor={colors.accent}
            selectionColor={colors.accent}
            textAlignVertical="center"
          />
        )}
        <View className="flex-row items-center gap-2 px-1">
          {!recording && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("localAI.commands.open")}
              onPress={onOpenCommands}
              disabled={!ready || busy || processing}
              hitSlop={6}
              className="h-9 min-w-9 flex-row items-center justify-center rounded-full border border-border px-2.5"
              style={{ opacity: !ready || busy || processing ? 0.45 : 1 }}
            >
              <Text className="font-manrope-bold text-[17px] text-foreground" style={{ lineHeight: 20 }}>
                /
              </Text>
            </Pressable>
          )}
          <View className="flex-1" />
          {recording ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("localAI.cancelRecording")}
                onPress={onCancelRecording}
                hitSlop={6}
                className="size-10 items-center justify-center rounded-full bg-surface-secondary"
              >
                <FilledIcon name="close" size={20} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("localAI.stopRecording")}
                onPress={onStopRecording}
                hitSlop={6}
                className="size-10 items-center justify-center rounded-full bg-danger"
              >
                <FilledIcon name="stop" size={18} color={colors.background} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={voiceAvailable ? t("localAI.recordVoice") : t("localAI.voiceNeedsAudioEngine")}
                onPress={onStartRecording}
                disabled={micDisabled}
                hitSlop={6}
                className="size-10 items-center justify-center rounded-full"
                style={{ opacity: micDisabled ? 0.4 : 1 }}
              >
                <FilledIcon name="mic-bold" size={22} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("localAI.send")}
                onPress={onSend}
                disabled={!canSend}
                hitSlop={6}
                className="size-10 items-center justify-center rounded-full"
                style={{ backgroundColor: canSend ? colors.foreground : colors.border }}
              >
                <FilledIcon name="arrow-upward" size={22} color={canSend ? colors.background : colors.muted} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

/** Reserves room at the end of the transcript for the keyboard. */
export function KeyboardSpacer({
  keyboard,
  bottomInset,
  base,
}: {
  keyboard: ReturnType<typeof useChatKeyboard>;
  bottomInset: number;
  base: number;
}) {
  const style = useAnimatedStyle(() => ({
    height: base + Math.max(keyboard.height.value - bottomInset, 0),
  }));
  return <Animated.View style={style} />;
}
