import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { BottomSheet, BottomSheetScrollView } from "@/shared/ui/app-bottom-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import {
  CHAT_COMMANDS,
  COMMAND_GROUPS,
  filterCommands,
  type ChatCommand,
} from "../commands";

/**
 * Every capability of the local AI as a short, searchable list. Choosing an
 * item either runs it right away or places a sentence to finish in the
 * message box.
 */
export function CommandSheet({
  initialQuery,
  onSelect,
  onDismiss,
}: {
  initialQuery: string;
  onSelect: (command: ChatCommand) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const opened = useRef(Platform.OS === "ios");
  const openingFrame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (openingFrame.current !== null) cancelAnimationFrame(openingFrame.current);
    },
    [],
  );

  function openAfterLayout() {
    if (opened.current || openingFrame.current !== null) return;
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = null;
      opened.current = true;
      setIsOpen(true);
    });
  }

  function close() {
    setIsOpen(false);
    onDismiss();
  }

  const label = (command: ChatCommand) =>
    t(`localAI.commands.items.${command.id}` as "localAI.commands.items.netWorth");
  const matches = useMemo(() => filterCommands(CHAT_COMMANDS, query, label), [query, t]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && opened.current && isOpen) close();
      }}
    >
      <AppBottomSheetPortal isOpen={isOpen} unstable_accessibilityContainerViewIsModal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["82%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          topInset={insets.top}
          bottomInset={insets.bottom}
          contentContainerClassName="h-full px-0 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View onLayout={openAfterLayout} className="flex-1">
            <View className="gap-3 border-b border-border px-5 pb-4">
              <BottomSheet.Title>{t("localAI.commands.title")}</BottomSheet.Title>
              <View className="flex-row items-center gap-2 rounded-2xl bg-background px-3">
                <FilledIcon name="magnify" size={20} tone="muted" />
                <TextInput
                  accessibilityLabel={t("localAI.commands.search")}
                  placeholder={t("localAI.commands.search")}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  className="h-11 flex-1 text-base text-foreground"
                  placeholderTextColor={colors.muted}
                  cursorColor={colors.accent}
                  selectionColor={colors.accent}
                />
                {!!query && (
                  <Pressable accessibilityRole="button" accessibilityLabel={t("common.clear", { defaultValue: "Clear" })} hitSlop={8} onPress={() => setQuery("")}>
                    <FilledIcon name="close" size={18} tone="muted" />
                  </Pressable>
                )}
              </View>
            </View>
            <BottomSheetScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 16 }}
            >
              {!matches.length && (
                <Text className="py-8 text-center text-muted">{t("localAI.commands.empty")}</Text>
              )}
              {COMMAND_GROUPS.map((group) => {
                const items = matches.filter((command) => command.group === group);
                if (!items.length) return null;
                return (
                  <View key={group} className="pb-2">
                    <Text className="pb-1 pt-3 text-[12px] font-manrope-semibold uppercase tracking-widest text-muted">
                      {t(`localAI.commands.groups.${group}`)}
                    </Text>
                    {items.map((command) => (
                      <Pressable
                        key={command.id}
                        accessibilityRole="button"
                        onPress={() => {
                          setIsOpen(false);
                          onSelect(command);
                          onDismiss();
                        }}
                        className="min-h-14 flex-row items-center gap-3.5 py-2"
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      >
                        <View
                          className="size-10 items-center justify-center rounded-xl"
                          style={{ backgroundColor: colorWithAlpha(colors.accent, command.template ? 0.1 : 0.18) }}
                        >
                          <FilledIcon name={command.icon} size={20} color={colors.accent} />
                        </View>
                        <Text className="flex-1 font-manrope-semibold text-[15px] text-foreground">{label(command)}</Text>
                        <FilledIcon name={command.template ? "pencil" : "chevron-right"} size={17} tone="muted" />
                      </Pressable>
                    ))}
                  </View>
                );
              })}
            </BottomSheetScrollView>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
