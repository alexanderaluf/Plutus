import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { TABULAR } from "@/features/reports/components/report-primitives";
import { colorForeground } from "@/shared/icons/colors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

import type { Account } from "../../types";
import { AccountIcon } from "../account-icon";
import { InfoChip } from "./detail-primitives";

/**
 * Who the account is and what it holds right now. One number dominates the
 * page; everything else here is identification.
 */
export function AccountDetailsHero({ account }: { account: Account }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { amountsHidden, formatCurrency } = useCurrencyFormat();

  const kindLabel = t(`accounts.common.kinds.${account.kind}`);
  const isCredit = account.kind === "credit";
  const tracksCycle =
    isCredit &&
    ((account.creditLimit ?? 0) > 0 || account.billingCycle !== null);

  // A card with a cycle or limit is read by this cycle's spending, like its
  // card face; every other account is read by its balance.
  const label = tracksCycle
    ? t("accounts.cards.spentThisCycle")
    : isCredit && account.balance < 0
      ? t("accounts.cards.currentDebt")
      : account.kind === "savings"
        ? t("accounts.details.currentValue")
        : t("accounts.details.currentBalance");
  const value = tracksCycle ? account.currentSpent : account.balance;
  // "Current debt" already says the card is owed; a minus would say it twice.
  const negative = !tracksCycle && !isCredit && value < 0;
  const sign = negative && !amountsHidden ? "−" : "";

  const meta = (
    isCredit
      ? [account.cardCompany || kindLabel, account.bankName]
      : account.kind === "savings"
        ? [
            account.savingsSummary?.providerName || account.bankName,
            account.savingsSummary?.isDetailed
              ? account.savingsSummary.productLabel
              : kindLabel,
          ]
        : [account.bankName, kindLabel]
  )
    .filter(Boolean)
    .join(" · ");

  const lastDigits = isCredit
    ? account.lastFour
    : account.accountNumber.slice(-4);

  return (
    <View className="items-center px-2 pt-1">
      <View
        className="size-[68px] items-center justify-center rounded-[22px]"
        style={{
          backgroundColor: account.color,
          borderCurve: "continuous",
          opacity: account.isExcluded ? 0.55 : 1,
        }}
      >
        <AccountIcon
          color={colorForeground(account.color)}
          name={account.icon}
          pathData={account.iconPath}
          size={34}
        />
      </View>

      <Text
        accessibilityRole="header"
        numberOfLines={2}
        className="mt-3.5 text-center font-manrope-bold text-[22px] leading-[28px] tracking-[-0.2px] text-foreground"
      >
        {account.name}
      </Text>
      {meta ? (
        <Text
          numberOfLines={1}
          className="mt-0.5 text-center font-sans text-[14px] leading-[20px] text-muted"
        >
          {meta}
        </Text>
      ) : null}

      <Text className="mt-6 text-center font-manrope-semibold text-[13px] leading-[18px] text-muted">
        {label}
      </Text>
      <Text
        accessibilityLabel={`${label}: ${sign}${formatCurrency(value, account.currencyCode)}`}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        numberOfLines={1}
        selectable={!amountsHidden}
        className="mt-1 text-center font-manrope-bold text-[40px] leading-[48px] tracking-[-0.8px]"
        style={{
          ...TABULAR,
          color: sign ? theme.danger : theme.foreground,
        }}
      >
        {sign}
        {formatCurrency(value, account.currencyCode)}
      </Text>

      <View className="mt-4 flex-row flex-wrap items-center justify-center gap-2">
        {lastDigits ? (
          <InfoChip
            icon={isCredit ? "credit-card" : "bank"}
            label={`•• ${lastDigits}`}
          />
        ) : null}
        {account.ownerName ? (
          <InfoChip icon="account" label={account.ownerName} />
        ) : null}
        <InfoChip label={account.currencyCode} />
        {account.isDefault ? (
          <InfoChip
            icon="check"
            label={t("accounts.common.badges.default")}
            color={theme.accent}
          />
        ) : null}
        {account.isExcluded ? (
          <InfoChip
            icon="eye-off"
            label={t("accounts.common.badges.excludedFromTotals")}
          />
        ) : null}
      </View>
    </View>
  );
}
