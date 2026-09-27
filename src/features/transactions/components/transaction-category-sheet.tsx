import {
  BottomSheetScrollView,
  BottomSheet,
} from "@/shared/ui/app-bottom-sheet";
import { Button } from "heroui-native";

import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import type { TransactionOption } from "./transaction-selection-section";

function CategoryRow({
  option,
  selected,
  subtitle,
  onPress,
}: {
  option: TransactionOption;
  selected: boolean;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useAppThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={option.name}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-4 px-1 py-2"
      style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
    >
      <View
        className="size-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colorWithAlpha(option.color, 0.18) }}
      >
        <RecordIcon
          color={option.color}
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
      {selected ? (
        <View
          className="size-7 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.accent }}
        >
          <FilledIcon name="check" size={18} tone="accent-foreground" />
        </View>
      ) : null}
    </Pressable>
  );
}

export function TransactionCategorySheet({
  parent,
  options,
  selectedId,
  onSelect,
  onDismiss,
}: {
  parent: TransactionOption;
  options: TransactionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}) {
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
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["72%"]}
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
              <BottomSheet.Title>
                {t("transactions.categorySheet.title", {
                  name: parent.name,
                })}
              </BottomSheet.Title>
              <View className="flex-row items-center gap-3">
                <View
                  className="size-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: colorWithAlpha(parent.color, 0.18),
                  }}
                >
                  <RecordIcon
                    color={parent.color}
                    name={parent.icon}
                    pathData={parent.iconPath}
                    size={23}
                  />
                </View>
                <BottomSheet.Description className="flex-1">
                  {options.length
                    ? t("transactions.categorySheet.description", {
                        count: options.length,
                      })
                    : t("transactions.categorySheet.empty")}
                </BottomSheet.Description>
              </View>
            </View>
            <BottomSheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 12,
              }}
            >
              {options.map((child) => (
                <CategoryRow
                  key={child.id}
                  option={child}
                  selected={selectedId === child.id}
                  subtitle={child.description}
                  onPress={() => select(child.id)}
                />
              ))}
            </BottomSheetScrollView>
            <View
              className="border-t border-border px-5 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
            >
              <Button variant="outline" onPress={close}>
                <Button.Label>
                  {t("transactions.categorySheet.cancel")}
                </Button.Label>
              </Button>
            </View>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
