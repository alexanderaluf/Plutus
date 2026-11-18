import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  CONTINUOUS,
  FigureTile,
  TABULAR,
} from "@/features/reports/components/report-primitives";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FormDivider } from "@/shared/ui/form-ui";

import type { Account } from "../../types";
import {
  AnimatedMeter,
  CountPill,
  DetailLine,
  RowIcon,
} from "./detail-primitives";

const WARNING = "#f59e0b";

function StatusSurface({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="gap-4 rounded-[24px] border border-border bg-surface p-4"
      style={CONTINUOUS}
    >
      {children}
    </View>
  );
}

/**
 * What happens next on this account. Only cards with a payday or limit and
 * detailed savings have something ahead of them; other accounts render nothing.
 */
export function AccountStatusCard({ account }: { account: Account }) {
  if (account.kind === "credit") return <CreditStatus account={account} />;
  if (account.kind === "savings" && account.savingsSummary?.isDetailed)
    return <SavingsStatus account={account} />;
  return null;
}

function CreditStatus({ account }: { account: Account }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatDate } = useAppDate();
  const { amountsHidden, formatCurrency } = useCurrencyFormat();
  const cycle = account.billingCycle;
  const limit = account.creditLimit ?? 0;
  if (!cycle && limit <= 0) return null;

  const days = cycle?.daysUntilPayment ?? null;
  const countdown =
    days === null
      ? null
      : days <= 0
        ? t("accounts.cards.today")
        : days === 1
          ? t("accounts.cards.tomorrow")
          : t("accounts.cards.daysLeft", { days });
  const soon = days !== null && days <= 3;

  // Installment plans that hold the limit count as used until charged.
  const used =
    limit > 0 ? (account.currentSpent + account.creditHold) / limit : 0;
  const meterColor = account.isOverdraft
    ? theme.danger
    : used >= 0.8
      ? WARNING
      : theme.accent;

  return (
    <StatusSurface>
      {cycle ? (
        <View className="flex-row items-center gap-3.5">
          <RowIcon name="calendar" color={soon ? WARNING : theme.accent} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-sans text-[12px] leading-[17px] text-muted">
              {t("accounts.details.status.nextPayment")}
            </Text>
            <Text
              numberOfLines={1}
              className="font-manrope-bold text-[17px] leading-[22px] text-foreground"
            >
              {formatDate(cycle.nextPaymentDate)}
            </Text>
            {account.linkedBankAccountName ? (
              <Text
                numberOfLines={1}
                className="font-sans text-[13px] leading-[18px] text-muted"
              >
                {t("accounts.details.status.paidFrom", {
                  account: account.linkedBankAccountName,
                })}
              </Text>
            ) : null}
          </View>
          {countdown ? (
            <CountPill label={countdown} color={soon ? WARNING : theme.accent} />
          ) : null}
        </View>
      ) : null}

      {cycle && limit > 0 ? <FormDivider /> : null}

      {limit > 0 ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-manrope-semibold text-[14px] leading-[20px] text-foreground">
              {t("accounts.details.status.creditLimit")}
            </Text>
            <Text
              className="font-manrope-bold text-[13px] leading-[18px]"
              style={{ ...TABULAR, color: meterColor }}
            >
              {t("accounts.cards.limitUsed", {
                percent: Math.round(used * 100),
              })}
            </Text>
          </View>
          <AnimatedMeter
            fraction={used}
            color={meterColor}
            accessibilityLabel={t("accounts.details.status.creditLimit")}
          />
          <View className="flex-row gap-2.5">
            {account.isOverdraft ? (
              <FigureTile
                dotColor={theme.danger}
                label={t("accounts.cards.overdraftTitle")}
                toneClass={amountsHidden ? "text-foreground" : "text-danger"}
                value={formatCurrency(
                  account.overdraftAmount,
                  account.currencyCode,
                )}
              />
            ) : (
              <FigureTile
                dotColor={theme.success}
                label={t("accounts.cards.availableCredit")}
                value={formatCurrency(
                  account.availableCredit ?? 0,
                  account.currencyCode,
                )}
              />
            )}
            <FigureTile
              dotColor={theme.muted}
              label={t("accounts.cards.creditLimit")}
              value={formatCurrency(limit, account.currencyCode)}
            />
          </View>
        </View>
      ) : null}
    </StatusSurface>
  );
}

function SavingsStatus({ account }: { account: Account }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatDate } = useAppDate();
  const { formatCurrency } = useCurrencyFormat();
  const summary = account.savingsSummary!;
  const code = account.currencyCode;
  const total = Math.max(0, summary.principal) + Math.max(0, summary.earnings);
  const growthShare = total > 0 ? Math.max(0, summary.earnings) / total : 0;
  const monthly =
    summary.monthlyContribution + summary.employerMonthlyContribution;
  const maturity = summary.maturityDate ? new Date(summary.maturityDate) : null;

  const lines = [
    monthly > 0
      ? [
          t("accounts.details.status.monthlyFunding"),
          t("accounts.cards.perMonth", {
            amount: formatCurrency(monthly, code),
          }),
        ]
      : null,
    maturity && !Number.isNaN(maturity.getTime())
      ? [t("accounts.cards.matures"), formatDate(maturity)]
      : null,
    summary.estimatedNetWithdrawal > 0
      ? [
          t("accounts.cards.estimatedWithdrawal"),
          formatCurrency(summary.estimatedNetWithdrawal, code),
        ]
      : null,
    summary.liquidityLabel
      ? [t("accounts.details.status.access"), summary.liquidityLabel]
      : null,
  ].filter((line): line is string[] => line !== null);

  return (
    <StatusSurface>
      <View className="flex-row items-center gap-3.5">
        <RowIcon name="piggy-bank" color={theme.success} />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 font-manrope-bold text-[17px] leading-[22px] text-foreground"
        >
          {t("accounts.details.status.savingsTitle")}
        </Text>
        {summary.expectedAnnualReturnRate ? (
          <CountPill
            label={t("accounts.list.perYear", {
              rate: summary.expectedAnnualReturnRate,
            })}
            color={theme.success}
          />
        ) : null}
      </View>

      {total > 0 ? (
        <View
          accessible={false}
          className="h-2 w-full flex-row gap-1 overflow-hidden rounded-full bg-surface-secondary"
        >
          <View
            style={{
              flex: Math.max(1 - growthShare, 0.04),
              backgroundColor: colorWithAlpha(theme.accent, 0.85),
              borderRadius: 999,
            }}
          />
          {growthShare > 0 ? (
            <View
              style={{
                flex: Math.max(growthShare, 0.04),
                backgroundColor: theme.success,
                borderRadius: 999,
              }}
            />
          ) : null}
        </View>
      ) : null}

      <View className="flex-row gap-2.5">
        <FigureTile
          dotColor={theme.accent}
          label={t("accounts.cards.yourPrincipal")}
          value={formatCurrency(summary.principal, code)}
        />
        <FigureTile
          dotColor={theme.success}
          label={t("accounts.cards.earnedGrowth")}
          value={formatCurrency(summary.earnings, code)}
        />
      </View>

      {lines.length ? (
        <View className="gap-2.5 pt-0.5">
          {lines.map(([label, value]) => (
            <DetailLine key={label} label={label} value={value} />
          ))}
        </View>
      ) : null}
    </StatusSurface>
  );
}
