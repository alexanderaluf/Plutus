import { memo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type { createTransactionProjector } from "@/data/selectors/transaction-selectors";
import { IndexedTransactionRow } from "@/features/home/components/transaction-list";
import type { Transaction } from "@/features/home/types";
import { useAppDate } from "@/shared/lib/use-app-date";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

import type { SearchRow } from "../search-rows";

type DayRow = Extract<SearchRow, { kind: "day" }>;
type TransactionRow = Extract<SearchRow, { kind: "transaction" }>;

export const SearchDayHeader = memo(function SearchDayHeader({
  row,
  todayKey,
  yesterdayKey,
}: {
  row: DayRow;
  todayKey: string;
  yesterdayKey: string;
}) {
  const { t, i18n } = useTranslation();
  const { formatDate } = useAppDate();
  const label = !row.date
    ? t("common.unknownDate")
    : row.dayKey === todayKey
      ? t("search.results.today")
      : row.dayKey === yesterdayKey
        ? t("search.results.yesterday")
        : `${row.date.toLocaleDateString(i18n.resolvedLanguage, {
            weekday: "long",
          })} · ${formatDate(row.date)}`;

  return (
    <Text
      accessibilityRole="header"
      className="px-1 pb-2 pt-5 font-manrope-semibold text-xs text-muted"
    >
      {label}
    </Text>
  );
});

/** One cell of a day card: corners and dividers depend on its position. */
export const SearchTransactionCell = memo(function SearchTransactionCell({
  row,
  project,
  onPress,
}: {
  row: TransactionRow;
  project: ReturnType<typeof createTransactionProjector>;
  onPress: (transaction: Transaction) => void;
}) {
  return (
    <View
      className={`bg-surface px-4 ${row.first ? "rounded-t-3xl pt-1" : ""} ${
        row.last ? "rounded-b-3xl pb-1" : ""
      }`}
    >
      <IndexedTransactionRow
        entry={row.entry}
        project={project}
        showBorder={!row.last}
        onPress={onPress}
      />
    </View>
  );
});

export function SearchEmptyState({
  icon,
  title,
  description,
}: {
  icon: FilledIconName;
  title: string;
  description: string;
}) {
  return (
    <View className="items-center rounded-[28px] bg-surface px-6 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-surface-secondary">
        <FilledIcon name={icon} size={30} tone="accent" />
      </View>
      <Text className="mt-4 text-center font-manrope-bold text-base text-foreground">
        {title}
      </Text>
      <Text className="mt-1 text-center font-sans text-sm leading-5 text-muted">
        {description}
      </Text>
    </View>
  );
}
