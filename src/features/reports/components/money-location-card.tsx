import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { ConsumptionReport } from "@/data/selectors/consumption-report-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { ReportHeading, ReportPanel } from "./report-primitives";

function accountIcon(kind: string): FilledIconName {
  if (/credit|card/i.test(kind)) return "credit-card";
  if (/saving/i.test(kind)) return "piggy-bank";
  return /cash/i.test(kind) ? "cash" : "bank";
}

export function MoneyLocationCard({
  holdings,
}: {
  holdings: ConsumptionReport["holdings"];
}) {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrencyFormat();
  const theme = useAppThemeColors();
  return (
    <ReportPanel>
      <ReportHeading
        icon="bank"
        title={t("reports.overview.moneyLocation")}
        detail={t("reports.overview.now")}
      />
      {holdings.length === 0 ? (
        <Text className="font-sans text-sm text-muted">
          {t("reports.overview.noAccounts")}
        </Text>
      ) : null}
      {holdings.map((group) => (
        <View key={group.currencyCode} className="gap-4">
          <View className="flex-row flex-wrap items-baseline justify-between gap-2">
            <Text className="font-sans text-xs text-muted">
              {t("reports.overview.netBalance")} · {group.currencyCode}
            </Text>
            <Text
              selectable
              className="font-manrope-bold text-2xl text-foreground"
            >
              {formatCurrency(group.net, group.currencyCode)}
            </Text>
          </View>
          {group.accounts.map((account) => (
            <View key={account.id} className="gap-2">
              <View className="flex-row items-center gap-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-surface-secondary">
                  <FilledIcon
                    name={accountIcon(account.kind)}
                    size={20}
                    tone="muted"
                  />
                </View>
                <Text className="flex-1 font-manrope-semibold text-sm text-foreground">
                  {account.name}
                </Text>
                <Text
                  selectable
                  className={`font-manrope-bold text-sm ${account.balance < 0 ? "text-danger" : "text-foreground"}`}
                >
                  {formatCurrency(account.balance, group.currencyCode)}
                </Text>
              </View>
              <View className="h-1 overflow-hidden rounded-full bg-surface-secondary">
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor:
                      account.balance < 0 ? theme.danger : theme.accent,
                    width: `${group.positive + group.debt ? (Math.abs(account.balance) / (group.positive + group.debt)) * 100 : 0}%`,
                  }}
                />
              </View>
            </View>
          ))}
          <View className="flex-row flex-wrap justify-between gap-3 border-t border-border pt-3">
            <View className="gap-1">
              <Text className="font-sans text-xs text-muted">
                {t("reports.overview.positiveBalances")}
              </Text>
              <Text
                selectable
                className="font-manrope-semibold text-sm text-foreground"
              >
                {formatCurrency(group.positive, group.currencyCode)}
              </Text>
            </View>
            <View className="gap-1">
              <Text className="font-sans text-xs text-muted">
                {t("reports.overview.negativeBalances")}
              </Text>
              <Text
                selectable
                className="font-manrope-semibold text-sm text-foreground"
              >
                {formatCurrency(group.debt, group.currencyCode)}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </ReportPanel>
  );
}
