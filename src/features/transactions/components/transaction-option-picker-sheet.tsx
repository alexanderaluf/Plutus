import {
  BottomSheet,
  BottomSheetScrollView,
} from "@/shared/ui/app-bottom-sheet";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import type { TransactionOption } from "./transaction-selection-section";

function OptionRow({
  option,
  selected,
  onPress,
}: {
  option: TransactionOption;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppThemeColors();
  const { direction } = useAppLocalization();

  return (
    <Pressable
      accessibilityLabel={option.name}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3.5 px-1 py-2"
      style={({ pressed }) => ({ direction, opacity: pressed ? 0.68 : 1 })}
    >
      <View
        className="size-11 items-center justify-center rounded-full"
        style={{ backgroundColor: colorWithAlpha(option.color, 0.16) }}
      >
        <RecordIcon
          color={option.color}
          name={option.icon}
          pathData={option.iconPath}
          size={22}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className="font-manrope-semibold text-base text-foreground"
        >
          {option.name}
        </Text>
        {option.description ? (
          <Text numberOfLines={1} className="font-sans text-sm text-muted">
            {option.description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View
          className="size-7 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accent }}
        >
          <FilledIcon name="check" size={16} tone="accent-foreground" />
        </View>
      ) : null}
    </Pressable>
  );
}

type TransactionOptionPickerSheetProps = {
  title: string;
  options: TransactionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDismiss: () => void;
  onAdd?: () => void;
};

/**
 * Reusable single-select bottom sheet for secondary transaction links
 * (Budget, Label, Loan, Place, Payee). Tapping the selected option clears it.
 */
export function TransactionOptionPickerSheet({
  title,
  options,
  selectedId,
  onSelect,
  onDismiss,
  onAdd,
}: TransactionOptionPickerSheetProps) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const { bindSheet, ...initialPositionFix } =
    useBottomSheetInitialPositionFix(isOpen);
  const opened = useRef(Platform.OS === "ios");
  const openingFrame = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (openingFrame.current !== null)
        cancelAnimationFrame(openingFrame.current);
    };
  }, []);

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

  function pick(id: string) {
    setIsOpen(false);
    onSelect(selectedId === id ? "" : id);
    onDismiss();
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && opened.current && isOpen) close();
      }}
    >
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="rounded-t-[28px] bg-surface"
          ref={bindSheet}
          containerStyle={initialPositionFix.containerStyle}
          contentContainerClassName="h-full px-0 pb-0 pt-2"
          enableDynamicSizing={false}
          enableOverDrag={false}
          handleIndicatorClassName="w-10 bg-muted/40"
          snapPoints={["62%"]}
          topInset={insets.top}
          onChange={initialPositionFix.onChange}
        >
          <View className="flex-1" style={{ direction }} onLayout={openAfterLayout}>
            <View className="flex-row items-center justify-between gap-3 border-b border-border px-5 pb-4">
              <BottomSheet.Title>{title}</BottomSheet.Title>
              {onAdd ? (
                <Pressable
                  accessibilityLabel={t(
                    "transactions.selection.addAccessibility",
                    { title },
                  )}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    close();
                    onAdd();
                  }}
                  className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
                  style={({ pressed }) => ({
                    backgroundColor: colorWithAlpha(theme.accent, 0.14),
                    opacity: pressed ? 0.72 : 1,
                  })}
                >
                  <FilledIcon name="plus" size={16} tone="accent" />
                  <Text className="font-manrope-semibold text-sm text-accent">
                    {t("transactions.selection.add")}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <BottomSheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 10,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              }}
            >
              {options.length > 0 ? (
                options.map((option) => (
                  <OptionRow
                    key={option.id}
                    option={option}
                    selected={option.id === selectedId}
                    onPress={() => pick(option.id)}
                  />
                ))
              ) : (
                <Text className="py-6 text-center font-sans text-sm text-muted">
                  {t("transactions.selection.empty", { title })}
                </Text>
              )}
            </BottomSheetScrollView>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
