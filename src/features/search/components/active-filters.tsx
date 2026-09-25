import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import {
  DEFAULT_SEARCH_FILTERS,
  SEARCH_RELATIONS,
  type SearchFacetOption,
  type SearchFacets,
  type SearchFilters,
} from "@/data/selectors/search-selectors";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import { FilterPill } from "./filter-pill";

type ActiveChip = { key: string; label: string; remove: SearchFilters };

type ActiveFiltersProps = {
  filters: SearchFilters;
  facets: SearchFacets;
  onChange: (filters: SearchFilters) => void;
};

/**
 * The sheet's refinements, shown inline so each can be removed with one tap.
 * Type and period already have their own visible controls above.
 */
export function ActiveFilters({
  filters,
  facets,
  onChange,
}: ActiveFiltersProps) {
  const { t, i18n } = useTranslation();
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, {
      maximumFractionDigits: 2,
    }).format(value);

  const chips: ActiveChip[] = [];
  for (const relation of SEARCH_RELATIONS) {
    for (const id of filters[relation]) {
      const option = facets[relation].find((item) => item.id === id);
      chips.push({
        key: `${relation}:${id}`,
        label: option?.label ?? id,
        remove: {
          ...filters,
          [relation]: filters[relation].filter((value) => value !== id),
        },
      });
    }
  }
  const { minAmount: min, maxAmount: max } = filters;
  if (min !== null || max !== null)
    chips.push({
      key: "amount",
      label:
        min !== null && max !== null
          ? t("search.amount.chipRange", { min: number(min), max: number(max) })
          : min !== null
            ? t("search.amount.chipMin", { min: number(min) })
            : t("search.amount.chipMax", { max: number(max ?? 0) }),
      remove: { ...filters, minAmount: null, maxAmount: null },
    });
  if (filters.withNotes)
    chips.push({
      key: "notes",
      label: t("search.details.withNotes"),
      remove: { ...filters, withNotes: false },
    });
  if (filters.withReceipt)
    chips.push({
      key: "receipt",
      label: t("search.details.withReceipt"),
      remove: { ...filters, withReceipt: false },
    });

  if (!chips.length) return null;

  return (
    <View className="flex-row items-center">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="-ms-5 flex-1"
        contentContainerClassName="gap-2 ps-5 pe-2"
      >
        {chips.map((chip) => (
          <FilterPill
            key={chip.key}
            selected
            removable
            label={chip.label}
            accessibilityLabel={t("search.filters.remove", {
              label: chip.label,
            })}
            onPress={() => onChange(chip.remove)}
          />
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() =>
          onChange({
            ...DEFAULT_SEARCH_FILTERS,
            query: filters.query,
            types: filters.types,
            period: filters.period,
            sort: filters.sort,
          })
        }
        className="min-h-10 justify-center ps-2"
      >
        <Text className="font-manrope-bold text-[13px] text-accent">
          {t("search.filters.clearAll")}
        </Text>
      </Pressable>
    </View>
  );
}

/** Top-level categories people use most, as one-tap starting points. */
export function CategoryShortcuts({
  categories,
  onSelect,
}: {
  categories: SearchFacetOption[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const top = categories
    .filter((item) => item.depth === 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  if (!top.length) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <FilledIcon name="chart-donut-variant" size={17} tone="muted" />
        <Text className="font-manrope-bold text-sm text-foreground">
          {t("search.filters.quickCategories")}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {top.map((item) => {
          const color = item.color ?? theme.accent;
          return (
            <FilterPill
              key={item.id}
              compact
              label={item.label}
              trailingCount={item.count}
              accessibilityLabel={t("search.filters.option", {
                label: item.label,
                count: item.count,
              })}
              leading={
                <View
                  className="size-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: colorWithAlpha(color, 0.18) }}
                >
                  <RecordIcon
                    color={color}
                    name={item.icon ?? "shopping"}
                    pathData={item.iconPath}
                    size={14}
                  />
                </View>
              }
              onPress={() => onSelect(item.id)}
            />
          );
        })}
      </View>
    </View>
  );
}
