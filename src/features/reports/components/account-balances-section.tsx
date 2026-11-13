import type { ConsumptionReport } from "@/data/selectors/consumption-report-selectors";
import { HomeSectionHeader } from "@/features/home/components/home-section-header";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import {
  CONTINUOUS,
  FigureTile,
  RatioBar,
  ReportCard,
  ReportCardHeader,
  ReportEmptyState,
  ReportPill,
  ShareBar,
  TABULAR,
} from "./report-primitives";

function accountIcon(kind: string): FilledIconName {
  if (/credit|card/i.test(kind)) return "credit-card";
  if (/saving/i.test(kind)) return "piggy-bank";
  return /cash/i.test(kind) ? "cash" : "bank";
}

/**
 * Balances are today's snapshot, not the selected period's, so this section
 * sits last under its own heading instead of among the period cards.
 */
export function AccountBalancesSection({
  holdings,
}: {
  holdings: ConsumptionReport["holdings"];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const theme = useAppThemeColors();

  return (
    <View>
      <HomeSectionHeader
        title={t("reports.overview.moneyLocation")}
        count={holdings.reduce((sum, group) => sum + group.accounts.length, 0)}
        subtitle={t("reports.overview.asOfToday")}
        actionLabel={t("navigation.tabs.accounts")}
        onActionPress={() => router.push("/accounts")}
      />
      {holdings.length === 0 ? (
        <ReportEmptyState
          icon="wallet"
          message={t("reports.overview.noAccountsYet")}
        />
      ) : (
        <View className="gap-3">
          {holdings.map((group) => {
            const money = (value: number) =>
              formatCurrency(value, group.currencyCode);
            const isNegative = !amountsHidden && group.net < 0;
            const total = group.positive + group.debt;
            return (
              <ReportCard key={group.currencyCode}>
                <ReportCardHeader
                  icon="wallet"
                  title={t("reports.overview.netBalance")}
                  trailing={<ReportPill label={group.currencyCode} />}
                />
                <View className="gap-2.5">
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.68}
                    numberOfLines={1}
                    selectable={!amountsHidden}
                    className={`font-manrope-bold text-[34px] leading-[40px] tracking-[-0.6px] ${
                      isNegative ? "text-danger" : "text-foreground"
                    }`}
                    style={TABULAR}
                  >
                    {isNegative ? "−" : ""}
                    {money(group.net)}
                  </Text>
                  {amountsHidden ? null : (
                    <RatioBar primary={group.positive} secondary={group.debt} />
                  )}
                </View>
                <View className="flex-row gap-2.5">
                  <FigureTile
                    dotColor={theme.success}
                    label={t("reports.overview.positiveBalances")}
                    value={money(group.positive)}
                  />
                  <FigureTile
                    dotColor={group.debt > 0 ? theme.danger : theme.muted}
                    label={t("reports.overview.negativeBalances")}
                    value={money(group.debt)}
                    toneClass={
                      !amountsHidden && group.debt > 0
                        ? "text-danger"
                        : "text-foreground"
                    }
                  />
                </View>
                <View className="border-t border-border/70 pt-1">
                  {group.accounts.map((account, index) => {
                    const owes = account.balance < 0;
                    return (
                      <View
                        key={account.id}
                        className="flex-row items-center gap-3 py-3"
                        style={{
                          borderTopWidth:
                            index > 0 ? StyleSheet.hairlineWidth : 0,
                          borderTopColor: theme.border,
                        }}
                      >
                        <View
                          className="size-11 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary"
                          style={CONTINUOUS}
                        >
                          <FilledIcon
                            name={accountIcon(account.kind)}
                            size={20}
                            tone="muted"
                          />
                        </View>
                        <View className="min-w-0 flex-1 gap-2">
                          <Text
                            numberOfLines={1}
                            className="font-manrope-semibold text-[14px] leading-[19px] text-foreground"
                          >
                            {account.name}
                          </Text>
                          <ShareBar
                            share={
                              total
                                ? (Math.abs(account.balance) / total) * 100
                                : 0
                            }
                            color={owes ? theme.danger : theme.accent}
                          />
                        </View>
                        <Text
                          adjustsFontSizeToFit
                          minimumFontScale={0.78}
                          numberOfLines={1}
                          selectable={!amountsHidden}
                          className={`ms-1 max-w-[42%] shrink-0 text-right font-manrope-bold text-[15px] leading-[20px] ${
                            !amountsHidden && owes
                              ? "text-danger"
                              : "text-foreground"
                          }`}
                          style={TABULAR}
                        >
                          {!amountsHidden && owes ? "−" : ""}
                          {money(account.balance)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ReportCard>
            );
          })}
        </View>
      )}
    </View>
  );
}
