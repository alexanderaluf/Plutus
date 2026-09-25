import { Button, useBottomSheetAwareHandlers } from "heroui-native";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DEFAULT_SEARCH_FILTERS,
  type SearchFacetOption,
  type SearchFacets,
  type SearchFilters,
  type SearchRelation,
  type SearchSort,
} from "@/data/selectors/search-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import {
  BottomSheet,
  BottomSheetScrollView,
} from "@/shared/ui/app-bottom-sheet";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

import { FilterPill } from "./filter-pill";

const SORTS: SearchSort[] = ["newest", "oldest", "largest", "smallest"];
const COLLAPSED_ROWS = 6;
const CHIP_RELATIONS: { key: SearchRelation; icon: FilledIconName }[] = [
  { key: "labels", icon: "tag" },
  { key: "places", icon: "map-marker" },
  { key: "people", icon: "account" },
  { key: "budgets", icon: "piggy-bank" },
  { key: "currencies", icon: "currency-exchange" },
];

type SearchFilterSheetProps = {
  isOpen: boolean;
  filters: SearchFilters;
  facets: SearchFacets;
  countFor: (filters: SearchFilters) => number;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
};

function Section({
  icon,
  title,
  children,
}: {
  icon: FilledIconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-3 border-b border-border py-5">
      <View className="flex-row items-center gap-2">
        <FilledIcon name={icon} size={18} tone="muted" />
        <Text className="font-manrope-bold text-base text-foreground">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function ShowAllToggle({
  expanded,
  hidden,
  onPress,
}: {
  expanded: boolean;
  hidden: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      className="min-h-10 flex-row items-center gap-1 self-start"
    >
      <Text className="font-manrope-bold text-[13px] text-accent">
        {expanded ? t("search.filters.showLess") : t("search.filters.showAll")}
      </Text>
      {!expanded ? (
        <Text className="font-manrope-semibold text-[13px] text-muted">
          {t("search.filters.more", { count: hidden })}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Row list with icons and nesting; used for categories and accounts. */
function OptionRows({
  options,
  selected,
  onToggle,
}: {
  options: SearchFacetOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const [expanded, setExpanded] = useState(false);
  // Selected options stay visible even while the list is collapsed.
  const visible = expanded
    ? options
    : options.filter(
        (option, index) =>
          index < COLLAPSED_ROWS || selected.includes(option.id),
      );

  return (
    <View>
      {visible.map((option) => {
        const checked = selected.includes(option.id);
        const color = option.color ?? theme.accent;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={t("search.filters.option", {
              label: option.label,
              count: option.count,
            })}
            onPress={() => onToggle(option.id)}
            className="min-h-13 flex-row items-center gap-3 rounded-2xl py-1.5"
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              paddingStart: option.depth * 22,
            })}
          >
            <View
              className="size-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: colorWithAlpha(color, 0.16) }}
            >
              <RecordIcon
                color={color}
                name={option.icon ?? "wallet"}
                pathData={option.iconPath}
                size={option.depth ? 16 : 18}
              />
            </View>
            <Text
              numberOfLines={1}
              className={`flex-1 text-sm text-foreground ${
                option.depth ? "font-sans" : "font-manrope-semibold"
              }`}
            >
              {option.label}
            </Text>
            <Text className="font-sans text-xs text-muted">{option.count}</Text>
            <View
              className={`size-6 items-center justify-center rounded-lg ${
                checked ? "bg-accent" : "border-2 border-border"
              }`}
            >
              {checked ? (
                <FilledIcon
                  color={theme.accentForeground}
                  name="check"
                  size={16}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {options.length > COLLAPSED_ROWS ? (
        <ShowAllToggle
          expanded={expanded}
          hidden={options.length - visible.length}
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </View>
  );
}

function OptionChips({
  options,
  selected,
  onToggle,
}: {
  options: SearchFacetOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const limit = COLLAPSED_ROWS * 2;
  const visible = expanded
    ? options
    : options.filter(
        (option, index) => index < limit || selected.includes(option.id),
      );
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {visible.map((option) => (
          <FilterPill
            key={option.id}
            label={option.label}
            trailingCount={option.count}
            selected={selected.includes(option.id)}
            accessibilityLabel={t("search.filters.option", {
              label: option.label,
              count: option.count,
            })}
            onPress={() => onToggle(option.id)}
          />
        ))}
      </View>
      {options.length > limit ? (
        <ShowAllToggle
          expanded={expanded}
          hidden={options.length - visible.length}
          onPress={() => setExpanded((value) => !value)}
        />
      ) : null}
    </View>
  );
}

function AmountInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useAppThemeColors();
  const { direction } = useAppLocalization();
  const { onFocus, onBlur } = useBottomSheetAwareHandlers();
  return (
    <View className="flex-1 gap-1.5">
      <Text className="font-sans text-xs text-muted">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={theme.muted}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          minHeight: 50,
          borderRadius: 16,
          paddingHorizontal: 14,
          backgroundColor: theme.surfaceSecondary,
          color: theme.foreground,
          fontFamily: "Huninn_400Regular",
          fontSize: 16,
          direction,
          textAlign: "auto",
          writingDirection: direction,
        }}
      />
    </View>
  );
}

const amountText = (value: number | null) =>
  value === null ? "" : String(value);
function parseAmount(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function SearchFilterSheet({
  isOpen,
  filters,
  facets,
  countFor,
  onApply,
  onClose,
}: SearchFilterSheetProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const [draft, setDraft] = useState(filters);
  const [minText, setMinText] = useState(amountText(filters.minAmount));
  const [maxText, setMaxText] = useState(amountText(filters.maxAmount));

  const [wasOpen, setWasOpen] = useState(isOpen);
  // Each opening starts from what is applied; closing without applying discards.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setDraft(filters);
      setMinText(amountText(filters.minAmount));
      setMaxText(amountText(filters.maxAmount));
    }
  }

  const next: SearchFilters = {
    ...draft,
    minAmount: parseAmount(minText),
    maxAmount: parseAmount(maxText),
  };
  const count = isOpen ? countFor(next) : 0;
  const toggle = (relation: SearchRelation, id: string) =>
    setDraft((current) => ({
      ...current,
      [relation]: current[relation].includes(id)
        ? current[relation].filter((value) => value !== id)
        : [...current[relation], id],
    }));
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["88%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          topInset={insets.top}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          contentContainerClassName="h-full px-0 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View className="flex-1">
            <View className="flex-row items-center justify-between border-b border-border px-5 pb-4">
              <BottomSheet.Title>{t("search.filters.title")}</BottomSheet.Title>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setDraft({
                    ...DEFAULT_SEARCH_FILTERS,
                    query: draft.query,
                  });
                  setMinText("");
                  setMaxText("");
                }}
              >
                <Text className="font-manrope-bold text-sm text-accent">
                  {t("search.filters.reset")}
                </Text>
              </Pressable>
            </View>

            <BottomSheetScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 24,
              }}
            >
              <Section icon="sort" title={t("search.sort.title")}>
                <View className="flex-row flex-wrap gap-2">
                  {SORTS.map((sort) => (
                    <FilterPill
                      key={sort}
                      label={t(`search.sort.${sort}`)}
                      selected={draft.sort === sort}
                      onPress={() =>
                        setDraft((current) => ({ ...current, sort }))
                      }
                    />
                  ))}
                </View>
              </Section>

              {facets.categories.length ? (
                <Section
                  icon="chart-donut-variant"
                  title={t("search.relations.categories")}
                >
                  <OptionRows
                    options={facets.categories}
                    selected={draft.categories}
                    onToggle={(id) => toggle("categories", id)}
                  />
                </Section>
              ) : null}

              {facets.accounts.length ? (
                <Section icon="wallet" title={t("search.relations.accounts")}>
                  <OptionRows
                    options={facets.accounts}
                    selected={draft.accounts}
                    onToggle={(id) => toggle("accounts", id)}
                  />
                </Section>
              ) : null}

              <Section icon="cash" title={t("search.amount.title")}>
                <View className="flex-row gap-3">
                  <AmountInput
                    label={t("search.amount.min")}
                    value={minText}
                    onChange={setMinText}
                  />
                  <AmountInput
                    label={t("search.amount.max")}
                    value={maxText}
                    onChange={setMaxText}
                  />
                </View>
                <Text className="font-sans text-xs text-muted">
                  {t("search.amount.hint")}
                </Text>
              </Section>

              {CHIP_RELATIONS.filter(
                ({ key }) =>
                  facets[key].length > (key === "currencies" ? 1 : 0),
              ).map(({ key, icon }) => (
                <Section
                  key={key}
                  icon={icon}
                  title={t(`search.relations.${key}`)}
                >
                  <OptionChips
                    options={facets[key]}
                    selected={draft[key]}
                    onToggle={(id) => toggle(key, id)}
                  />
                </Section>
              ))}

              <Section icon="notes" title={t("search.details.title")}>
                <View className="flex-row flex-wrap gap-2">
                  <FilterPill
                    label={t("search.details.withNotes")}
                    leading={
                      <FilledIcon
                        name="notes"
                        size={15}
                        tone={draft.withNotes ? "accent-foreground" : "muted"}
                      />
                    }
                    selected={draft.withNotes}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        withNotes: !current.withNotes,
                      }))
                    }
                  />
                  <FilterPill
                    label={t("search.details.withReceipt")}
                    leading={
                      <FilledIcon
                        name="receipt"
                        size={15}
                        tone={draft.withReceipt ? "accent-foreground" : "muted"}
                      />
                    }
                    selected={draft.withReceipt}
                    onPress={() =>
                      setDraft((current) => ({
                        ...current,
                        withReceipt: !current.withReceipt,
                      }))
                    }
                  />
                </View>
              </Section>
            </BottomSheetScrollView>

            <View
              className="border-t border-border px-5 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <Button
                variant="primary"
                onPress={() => {
                  Keyboard.dismiss();
                  onApply(next);
                }}
              >
                <Button.Label>
                  {t("search.filters.show", {
                    count,
                    formattedCount: new Intl.NumberFormat(
                      i18n.resolvedLanguage,
                    ).format(count),
                  })}
                </Button.Label>
              </Button>
            </View>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
