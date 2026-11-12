import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { withAlpha } from "../lib/card-color";
import type { Account } from "../types";
import { AccountIcon } from "./account-icon";
import { CardCompanyLogo } from "./card-company-logo";

const TABULAR = { fontVariant: ["tabular-nums" as const] };
const LEADING_WIDTH = 48;

/**
 * One grouped surface per section with compact rows. Only the essentials are
 * shown; the account details screen holds the full breakdown. The account's
 * chosen color appears only on the leading icon / mini card stripe.
 */
export function AccountGroupCard({
  accounts,
  onAccountPress,
}: {
  accounts: Account[];
  onAccountPress: (account: Account) => void;
}) {
  return (
    <View className="overflow-hidden rounded-[24px] border border-border bg-surface">
      {accounts.map((account, index) => (
        <View key={account.id}>
          {index > 0 && (
            <View
              className="h-px bg-border"
              style={{ marginStart: 16 + LEADING_WIDTH + 14 }}
            />
          )}
          <AccountRow account={account} onPress={() => onAccountPress(account)} />
        </View>
      ))}
    </View>
  );
}

function AccountRow({
  account,
  onPress,
}: {
  account: Account;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrencyFormat();
  const { primary, secondary, negative } = useRowValues(account);
  const subtitle = useSubtitle(account);
  const hasLimit = account.kind === "credit" && (account.creditLimit ?? 0) > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.list.viewDetails", { name: account.name })}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View
        className="flex-row items-center gap-3.5 px-4 py-3.5"
        style={account.isExcluded ? { opacity: 0.6 } : undefined}
      >
        <Leading account={account} />

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              className="shrink font-manrope-bold text-base text-foreground"
              numberOfLines={1}
            >
              {account.name}
            </Text>
            {account.isExcluded && (
              <FilledIcon name="eye-off" size={13} tone="muted" />
            )}
          </View>
          <Text
            className="font-manrope-medium text-[13px] text-muted"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
          {hasLimit && (
            <View className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-secondary">
              <View
                className={`h-full rounded-full ${
                  account.isOverdraft ? "bg-danger" : ""
                }`}
                style={{
                  backgroundColor: account.isOverdraft
                    ? undefined
                    : account.color,
                  width: `${
                    account.isOverdraft
                      ? 100
                      : Math.min(Math.max(account.creditUtilization, 0), 100)
                  }%`,
                }}
              />
            </View>
          )}
        </View>

        <View className="max-w-[46%] items-end gap-1">
          <Text
            adjustsFontSizeToFit
            className={`font-manrope-bold text-[17px] ${
              negative ? "text-danger" : "text-foreground"
            }`}
            minimumFontScale={0.7}
            numberOfLines={1}
            style={TABULAR}
          >
            {negative ? "−" : ""}
            {formatCurrency(primary, account.currencyCode)}
          </Text>
          {!!secondary && (
            <Text
              className={`font-manrope-medium text-xs ${secondary.tone}`}
              numberOfLines={1}
              style={TABULAR}
            >
              {secondary.text}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Leading({ account }: { account: Account }) {
  if (account.kind === "credit") {
    // A miniature card: the issuer logo on a white plate with a thin stripe
    // in the account color along the bottom edge.
    return (
      <View
        className="overflow-hidden rounded-lg border border-border bg-white"
        style={{ width: LEADING_WIDTH, height: 32 }}
      >
        <View className="flex-1 items-center justify-center">
          <CardCompanyLogo
            company={account.cardCompany}
            height={26}
            width={42}
          />
        </View>
        <View style={{ height: 3, backgroundColor: account.color }} />
      </View>
    );
  }
  return (
    <View
      className="items-center justify-center rounded-2xl"
      style={{
        width: LEADING_WIDTH,
        height: LEADING_WIDTH,
        backgroundColor: withAlpha(account.color, 0.14),
      }}
    >
      <AccountIcon
        color={account.color}
        name={account.icon}
        pathData={account.iconPath}
        size={22}
      />
    </View>
  );
}

function useSubtitle(account: Account) {
  const { t } = useTranslation();
  const parts: string[] = [];
  if (account.kind === "credit") {
    parts.push(account.cardCompany || t("accounts.cards.creditCard"));
    if (account.lastFour) parts.push(`•• ${account.lastFour}`);
  } else if (account.kind === "savings") {
    parts.push(
      account.savingsSummary?.providerName ||
        account.institution ||
        account.savingsSummary?.productLabel ||
        t("accounts.common.kinds.savings"),
    );
  } else {
    parts.push(
      account.bankName ||
        account.institution ||
        t(`accounts.common.kinds.${account.kind}`),
    );
    if (account.accountNumber) parts.push(`•• ${account.accountNumber.slice(-4)}`);
  }
  if (account.isDefault) parts.push(t("accounts.common.badges.default"));
  return parts.join(" · ");
}

type Secondary = { text: string; tone: string } | null;

function useRowValues(account: Account): {
  primary: number;
  secondary: Secondary;
  negative: boolean;
} {
  const { t } = useTranslation();
  const { formatCurrency, formatSignedCurrency } = useCurrencyFormat();
  const { formatDayMonth } = useAppDate();

  if (account.kind === "credit") {
    const tracksCycle =
      (account.creditLimit ?? 0) > 0 || !!account.billingCycle;
    let secondary: Secondary = null;
    if (account.isOverdraft) {
      secondary = {
        text: t("accounts.cards.overdraft", {
          amount: formatCurrency(account.overdraftAmount, account.currencyCode),
        }),
        tone: "text-danger",
      };
    } else if ((account.creditLimit ?? 0) > 0) {
      secondary = {
        text: t("accounts.list.availableAmount", {
          amount: formatCurrency(
            Math.max(0, account.availableCredit ?? 0),
            account.currencyCode,
          ),
        }),
        tone: "text-muted",
      };
    } else if (account.billingCycle) {
      secondary = {
        text: t("accounts.list.paysOn", {
          date: formatDayMonth(account.billingCycle.nextPaymentDate),
        }),
        tone: "text-muted",
      };
    }
    return tracksCycle
      ? { primary: account.currentSpent, secondary, negative: false }
      : { primary: account.balance, secondary, negative: account.balance < 0 };
  }

  if (account.kind === "savings") {
    const earnings = account.savingsSummary?.earnings ?? 0;
    const rate = account.savingsSummary?.expectedAnnualReturnRate ?? 0;
    const secondary: Secondary =
      account.savingsSummary?.isDetailed && earnings !== 0
        ? {
            text: formatSignedCurrency(earnings, account.currencyCode),
            tone: earnings < 0 ? "text-danger" : "text-success",
          }
        : rate
          ? {
              text: t("accounts.list.perYear", { rate }),
              tone: "text-muted",
            }
          : null;
    return { primary: account.balance, secondary, negative: account.balance < 0 };
  }

  return {
    primary: account.balance,
    secondary: null,
    negative: account.balance < 0,
  };
}
