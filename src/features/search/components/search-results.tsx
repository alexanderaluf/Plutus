import { Card } from "heroui-native";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import {
  colorWithAlpha,
  useAppThemeColors,
} from "@/shared/theme/app-theme";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { Text } from "@/shared/ui/app-text";

import type { SearchResult } from "../types";

type SearchResultsProps = {
  query: string;
  results: SearchResult[];
  total: number;
};

export function SearchResults({ query, results, total }: SearchResultsProps) {
  const { formatSignedCurrency } = useCurrencyFormat();
  const { i18n, t } = useTranslation();
  const theme = useAppThemeColors();

  if (!query.trim()) {
    return (
      <Card className="items-center border border-border bg-surface px-6 py-10">
        <FilledIcon name="magnify" size={30} tone="accent" />
        <Text className="mt-4 font-manrope-bold text-base text-foreground">
          {t("search.results.promptTitle")}
        </Text>
        <Text className="mt-1 text-center font-sans text-sm text-muted">
          {t("search.results.promptDescription")}
        </Text>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card className="items-center border border-border bg-surface px-6 py-10">
        <FilledIcon name="magnify-close" size={30} tone="accent" />
        <Text className="mt-4 font-manrope-bold text-base text-foreground">
          {t("search.results.emptyTitle")}
        </Text>
        <Text className="mt-1 text-center font-sans text-sm text-muted">
          {t("search.results.emptyDescription")}
        </Text>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-surface p-0">
      <Card.Header className="flex-row items-center justify-between px-5 pb-2 pt-5">
        <Card.Title className="font-manrope-bold text-lg text-foreground">
          {query ? t("search.results.title") : t("search.results.allActivity")}
        </Card.Title>
        <Text className="font-manrope-semibold text-xs text-muted">
          {t("search.results.matches", {
            count: total,
            formattedCount: new Intl.NumberFormat(
              i18n.resolvedLanguage,
            ).format(total),
          })}
        </Text>
      </Card.Header>

      <Card.Body className="px-5 pb-3">
        {results.map((result, index) => {
          const tone = result.amount > 0 ? theme.success : theme.accent;
          return (
            <View
              key={result.id}
              className={`flex-row items-center py-4 ${
                index < results.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <View
                className="size-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: colorWithAlpha(tone, 0.14) }}
              >
                <FilledIcon color={tone} name={result.icon} size={21} />
              </View>
              <View className="ms-3 flex-1">
                <Text className="font-manrope-bold text-sm text-foreground">
                  {result.title}
                </Text>
                <Text className="mt-0.5 font-sans text-xs text-muted">
                  {result.category} · {result.account}
                </Text>
              </View>
              <View className="ms-2 items-end">
                <Text
                  className={`font-manrope-bold text-sm ${
                    result.amount > 0 ? "text-accent" : "text-foreground"
                  }`}
                >
                  {formatSignedCurrency(result.amount, result.currencyCode)}
                </Text>
                <Text className="mt-0.5 font-sans text-[10px] text-muted">
                  {result.date}
                </Text>
              </View>
            </View>
          );
        })}
        {total > results.length ? (
          <Text className="py-3 text-center font-sans text-xs text-muted">
            {t("search.results.truncated", { count: results.length })}
          </Text>
        ) : null}
      </Card.Body>
    </Card>
  );
}
