import {
  BottomSheetScrollView,
  BottomSheet,
} from "@/shared/ui/app-bottom-sheet";

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorForeground } from "@/shared/icons/colors";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { RecordIcon } from "@/shared/ui/record-icon";

import type { TransactionOption } from "./transaction-selection-section";

/** A chosen row is shown by the category's own colour, never a check mark. */
function CategoryRow({
  option,
  selected,
  multiple,
  subtitle,
  onPress,
}: {
  option: TransactionOption;
  selected: boolean;
  multiple: boolean;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useAppThemeColors();
  return (
    <Pressable
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={option.name}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-4 rounded-2xl px-2 py-2"
      style={({ pressed }) => ({
        backgroundColor: selected
          ? colorWithAlpha(option.color, theme.isDark ? 0.24 : 0.16)
          : "transparent",
        opacity: pressed ? 0.68 : 1,
        borderCurve: "continuous",
      })}
    >
      <View
        className="size-12 items-center justify-center rounded-full"
        style={{
          backgroundColor: selected
            ? option.color
            : colorWithAlpha(option.color, 0.18),
        }}
      >
        <RecordIcon
          color={selected ? colorForeground(option.color) : option.color}
          name={option.icon}
          pathData={option.iconPath}
          size={25}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-manrope-semibold text-base text-foreground">
          {option.name}
        </Text>
        {subtitle ? (
          <Text className="font-sans text-sm text-muted">{subtitle}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A main category and its subcategories. Single choice (a transaction) picks
 * one row and closes; multiple choice (a budget, via `selectedIds` and
 * `onToggle`) toggles rows and stays open until dismissed.
 */
export function TransactionCategorySheet({
  parent,
  options,
  selectedId = "",
  selectedIds,
  onSelect,
  onToggle,
  onDismiss,
}: {
  parent: TransactionOption;
  options: TransactionOption[];
  selectedId?: string;
  selectedIds?: readonly string[];
  onSelect?: (id: string) => void;
  onToggle?: (id: string) => void;
  onDismiss: () => void;
}) {
  const multiple = Boolean(onToggle);
  const isChosen = (id: string) =>
    multiple ? Boolean(selectedIds?.includes(id)) : selectedId === id;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(Platform.OS === "ios");
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
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

  function select(id: string) {
    if (onToggle) {
      onToggle(id);
      return;
    }
    setIsOpen(false);
    onSelect?.(selectedId === id ? "" : id);
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
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["72%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          topInset={insets.top}
          contentContainerClassName="h-full px-0 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View onLayout={openAfterLayout} className="flex-1">
            <View className="border-b border-border px-5 pb-4">
              <BottomSheet.Title>
                {t("transactions.categorySheet.title", {
                  name: parent.name,
                })}
              </BottomSheet.Title>
            </View>
            <BottomSheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                // Keeps the last row clear of the Android navigation buttons.
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              }}
            >
              <CategoryRow
                option={parent}
                multiple={multiple}
                selected={isChosen(parent.id)}
                subtitle={t("transactions.categorySheet.parentOption")}
                onPress={() => select(parent.id)}
              />
              {options.length ? (
                <Text className="px-1 pb-1 pt-4 font-manrope-semibold text-xs uppercase tracking-wider text-muted">
                  {t("transactions.categorySheet.subcategories")}
                </Text>
              ) : null}
              {options.map((child) => (
                <CategoryRow
                  key={child.id}
                  option={child}
                  multiple={multiple}
                  selected={isChosen(child.id)}
                  subtitle={child.description}
                  onPress={() => select(child.id)}
                />
              ))}
            </BottomSheetScrollView>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
