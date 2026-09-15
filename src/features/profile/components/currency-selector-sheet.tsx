import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import {
  BottomSheet,
  SearchField,
  useBottomSheetAwareHandlers,
  useThemeColor,
} from "heroui-native";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import type { CurrencyOption } from "../data/currencies-data";

type CurrencySelectorSheetProps = {
  currencies: CurrencyOption[];
  isOpen: boolean;
  selectedCode: string;
  closeOnSelect?: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelect: (currency: CurrencyOption) => void;
};

function normalizeSearch(value: string, locale: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase(locale)
    .trim();
}

function CurrencySearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();

  return (
    <SearchField value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input
          accessibilityLabel={t("currency.searchAccessibility")}
          placeholder={t("currency.searchPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-2xl border border-border bg-surface-secondary text-left font-sans"
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <SearchField.ClearButton
          accessibilityLabel={t("currency.clearSearch")}
        />
      </SearchField.Group>
    </SearchField>
  );
}

function CurrencyList({
  currencies,
  isOpen,
  selectedCode,
  onSelect,
}: Pick<
  CurrencySelectorSheetProps,
  "currencies" | "isOpen" | "selectedCode" | "onSelect"
>) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const listRef = useRef<ComponentRef<typeof BottomSheetFlatList>>(null);
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [isOpen]);
  const insets = useSafeAreaInsets();
  const [accentForeground, muted] = useThemeColor([
    "accent-foreground",
    "muted",
  ]);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const normalizedCode = selectedCode.toUpperCase();
  const results = useMemo(() => {
    const search = normalizeSearch(query, locale);
    return currencies.filter((item) =>
      normalizeSearch(`${item.code} ${item.name}`, locale).includes(search),
    );
  }, [currencies, locale, query]);

  return (
    <>
      <View className="px-5 pb-3 pt-2">
        <CurrencySearch
          value={query}
          onChange={(value) => {
            setQuery(value);
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
          }}
        />
      </View>

      <BottomSheetFlatList
        ref={listRef}
        data={results}
        extraData={normalizedCode}
        keyExtractor={(item: CurrencyOption) => item.code}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={7}
        renderItem={({ item }: { item: CurrencyOption }) => {
          const isSelected = item.code === normalizedCode;

          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={t("currency.optionAccessibility", {
                name: item.name,
                code: item.code,
              })}
              className={`my-0.5 min-h-18 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-surface-tertiary ${
                isSelected ? "bg-accent/10" : "bg-surface"
              }`}
              onPress={() => onSelect(item)}
            >
              <View
                className={`h-11 w-14 items-center justify-center rounded-xl ${
                  isSelected ? "bg-accent" : "bg-surface-tertiary"
                }`}
              >
                <Text
                  className={`font-manrope-bold text-xs ${
                    isSelected ? "text-accent-foreground" : "text-foreground"
                  }`}
                >
                  {item.code}
                </Text>
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-manrope-semibold text-sm text-foreground">
                  {item.name}
                </Text>
                <Text className="font-sans text-xs text-muted">
                  {item.code}
                </Text>
              </View>
              <View
                className={`size-6 items-center justify-center rounded-full ${
                  isSelected ? "bg-accent" : "border border-border"
                }`}
              >
                {isSelected ? (
                  <FilledIcon color={accentForeground} name="check" size={16} />
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View className="items-center gap-2 px-4 py-10">
            <FilledIcon color={muted} name="magnify-close" size={32} />
            <Text className="font-manrope-semibold text-base text-foreground">
              {t("currency.emptyTitle")}
            </Text>
            <Text className="text-center font-sans text-sm text-muted">
              {t("currency.emptyDescription")}
            </Text>
          </View>
        }
      />
    </>
  );
}

export function CurrencySelectorSheet({
  currencies,
  isOpen,
  selectedCode,
  closeOnSelect = true,
  onOpenChange,
  onSelect,
}: CurrencySelectorSheetProps) {
  const insets = useSafeAreaInsets();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);

  function handleOpenChange(open: boolean) {
    if (!open) Keyboard.dismiss();
    onOpenChange(open);
  }

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={handleOpenChange}>
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["85%"]}
          topInset={insets.top}
          enableDynamicSizing={false}
          enableOverDrag={false}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          contentContainerClassName="h-full px-0 pb-0"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <CurrencyList
            currencies={currencies}
            isOpen={isOpen}
            selectedCode={selectedCode}
            onSelect={(currency) => {
              onSelect(currency);
              if (closeOnSelect) handleOpenChange(false);
            }}
          />
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
