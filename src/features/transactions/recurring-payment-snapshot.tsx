import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { selectRecurringTransactionSnapshot } from "@/data/selectors/recurring-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppDate } from "@/shared/lib/use-app-date";
import { Text } from "@/shared/ui/app-text";

type RecurringTransactionSnapshot = NonNullable<
  ReturnType<typeof selectRecurringTransactionSnapshot>
>;

export function RecurringPaymentSnapshot({
  snapshot,
}: {
  snapshot: RecurringTransactionSnapshot | null;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDateTime } = useAppDate();
  const { t, i18n } = useTranslation();
  const rtl = i18n.dir(i18n.resolvedLanguage ?? i18n.language) === "rtl";
  const textStyle = {
    writingDirection: rtl ? ("rtl" as const) : ("ltr" as const),
    textAlign: rtl ? ("right" as const) : ("left" as const),
  };
  if (!snapshot) return null;
  const date = (value: string) => formatDateTime(new Date(value));
  const rows = [
    [
      t("recurring.original"),
      `${formatCurrency(snapshot.originalAmount, snapshot.originalCurrency)} ${snapshot.originalCurrency}`,
    ],
    [
      t("recurring.converted"),
      `${formatCurrency(snapshot.amount, snapshot.currency)} ${snapshot.currency}`,
    ],
    [t("recurring.scheduled"), date(snapshot.scheduledAt)],
    [t("recurring.recorded"), date(snapshot.recordedAt)],
    ...(snapshot.rateDate
      ? [
          [
            t("recurring.rate"),
            `1 ${snapshot.originalCurrency} = ${snapshot.rate} ${snapshot.currency}`,
          ],
          [t("recurring.rateDate"), snapshot.rateDate],
          [
            t("recurring.fetched"),
            snapshot.fetchedAt ? date(snapshot.fetchedAt) : "",
          ],
          [t("recurring.source"), snapshot.source ?? ""],
        ]
      : []),
  ];
  return (
    <View className="my-3 gap-3 rounded-2xl border border-border bg-surface p-4">
      <Text
        style={textStyle}
        className="font-manrope-bold text-base text-accent"
      >
        {t("recurring.title")}
      </Text>
      {rows.map(([label, value]) => (
        <View key={label} className="gap-1">
          <Text style={textStyle} className="text-xs text-muted">
            {label}
          </Text>
          <Text
            style={textStyle}
            selectable
            className="font-manrope-semibold text-sm text-foreground"
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
