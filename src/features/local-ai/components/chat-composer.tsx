import { useTranslation } from "react-i18next";
import { Pressable, TextInput, View } from "react-native";
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { FilledIcon } from "@/shared/ui/filled-icon";

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
  onToggleRecording,
  recording,
  ready,
  busy,
  onLayoutHeight,
}: {
  keyboard: ReturnType<typeof useChatKeyboard>;
  bottomInset: number;
  draft: string;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  onToggleRecording: () => void;
  recording: boolean;
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
  const canSend = ready && !busy && !recording && !!draft.trim();

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
        <TextInput
          accessibilityLabel={t("localAI.messagePlaceholder")}
          placeholder={
            recording ? t("localAI.listening") : t("localAI.messagePlaceholder")
          }
          value={draft}
          onChangeText={onChangeDraft}
          multiline
          editable={ready && !busy && !recording}
          className="max-h-32 min-h-11 px-3 py-2.5 text-base text-foreground"
          placeholderTextColor={colors.muted}
          cursorColor={colors.accent}
          selectionColor={colors.accent}
          textAlignVertical="center"
        />
        <View className="flex-row items-center justify-end gap-2 px-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recording ? t("localAI.stopRecording") : t("localAI.recordVoice")
            }
            onPress={onToggleRecording}
            disabled={!ready || busy}
            hitSlop={6}
            className={`size-10 items-center justify-center rounded-full ${recording ? "bg-danger" : "bg-surface-secondary"}`}
            style={{ opacity: !ready || busy ? 0.5 : 1 }}
          >
            <FilledIcon name="mic" size={20} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("localAI.send")}
            onPress={onSend}
            disabled={!canSend}
            hitSlop={6}
            className="size-10 items-center justify-center rounded-full bg-accent"
            style={{ opacity: canSend ? 1 : 0.45 }}
          >
            <FilledIcon name="send" size={20} />
          </Pressable>
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
