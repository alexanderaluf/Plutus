import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import type {
  SearchPeriod,
  SearchType,
} from "@/data/selectors/search-selectors";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";

import { FilterPill } from "./filter-pill";

const TYPES: (SearchType | "all")[] = ["all", "expense", "income", "transfer"];
const PERIODS: SearchPeriod[] = ["all", "cycle", "lastCycle", "days90", "year"];

type QuickFiltersProps = {
  types: SearchType[];
  period: SearchPeriod;
  onTypesChange: (types: SearchType[]) => void;
  onPeriodChange: (period: SearchPeriod) => void;
};

export function QuickFilters({
  types,
  period,
  onTypesChange,
  onPeriodChange,
}: QuickFiltersProps) {
  const { t } = useTranslation();
  // The quick control is single-choice; any other combination reads as "All".
  const selectedType: SearchType | "all" =
    types.length === 1 ? types[0] : "all";

  return (
    <View className="gap-3">
      <GlassSegmentedControl
        accessibilityLabel={t("search.types.accessibilityLabel")}
        fitLabels
        minHeight={40}
        tabPaddingHorizontal={4}
        options={TYPES.map((type) => ({
          label: t(`search.types.${type}`),
          value: type,
        }))}
        value={selectedType}
        onChange={(type) => onTypesChange(type === "all" ? [] : [type])}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="-mx-5"
        contentContainerClassName="gap-2 px-5"
      >
        {PERIODS.map((value) => (
          <FilterPill
            key={value}
            label={t(`search.periods.${value}`)}
            selected={value === period}
            onPress={() => onPeriodChange(value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
