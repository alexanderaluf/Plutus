import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { colorForeground } from "../account-options";
import {
  cardPalette,
  darken,
  isLightColor,
  lighten,
  withAlpha,
} from "../lib/card-color";
import type { Account } from "../types";
import { AccountIcon } from "./account-icon";
import { CardCompanyLogo } from "./card-company-logo";

const TABULAR = { fontVariant: ["tabular-nums" as const] };
const GROWTH = "#82d6a1";
const GROWTH_LIGHT_INK = "#15803d";

/**
 * Renders an account group using type-distinct surfaces so Bank, Checking,
 * Cash, Credit Cards, and Savings are recognizable at a single glance.
 */
export function AccountGroupCard({
  accounts,
  onAccountPress,
}: {
  accounts: Account[];
  onAccountPress: (account: Account) => void;
}) {
  const ledgerAccounts = accounts.filter(
    (account) => account.kind === "bank" || account.kind === "checking",
  );
  const cashAccounts = accounts.filter((account) => account.kind === "cash");
  const creditAccounts = accounts.filter(
    (account) => account.kind === "credit",
  );
  const savingsAccounts = accounts.filter(
    (account) => account.kind === "savings",
  );

  return (
    <View className="gap-3">
      {ledgerAccounts.length > 0 && (
        <LedgerGroupCard
          accounts={ledgerAccounts}
          onAccountPress={onAccountPress}
        />
      )}

      {cashAccounts.map((account) => (
        <CashWalletCard
          key={account.id}
          account={account}
          onPress={() => onAccountPress(account)}
        />
      ))}

      {creditAccounts.map((account) => (
        <CreditListCard
          key={account.id}
          account={account}
          onPress={() => onAccountPress(account)}
        />
      ))}

      {savingsAccounts.map((account) => (
        <SavingsListCard
          key={account.id}
          account={account}
          onPress={() => onAccountPress(account)}
        />
      ))}
    </View>
  );
}

/**
 * Institutional ledger box for Bank and Checking accounts.
 * Bank rows show a solid color stripe + soft tinted badge; Checking rows use a
 * dashed checkbook-framed badge so both read distinctly inside Bank & Cash.
 */
function LedgerGroupCard({
  accounts,
  onAccountPress,
}: {
  accounts: Account[];
  onAccountPress: (account: Account) => void;
}) {
  const theme = useAppThemeColors();

  return (
    <View
      className="overflow-hidden rounded-[24px] border border-border bg-surface"
      style={{ borderCurve: "continuous" }}
    >
      {accounts.map((account, index) => (
        <View key={account.id}>
          {index > 0 && (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.border,
                marginStart: 88,
                marginEnd: 16,
              }}
            />
          )}
          <LedgerRow
            account={account}
            onPress={() => onAccountPress(account)}
          />
        </View>
      ))}
    </View>
  );
}

function LedgerRow({
  account,
  onPress,
}: {
  account: Account;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { amountsHidden, formatCurrency } = useCurrencyFormat();
  const isChecking = account.kind === "checking";
  const showNegative = !amountsHidden && account.balance < 0;

  const institution =
    account.bankName || account.institution || "";
  const maskedNumber = account.accountNumber
    ? `•• ${account.accountNumber.slice(-4)}`
    : "";
  const detailText = [institution, maskedNumber].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.list.viewDetails", { name: account.name })}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
    >
      <View
        className="flex-row items-center gap-3 px-4 py-3.5"
        style={account.isExcluded ? { opacity: 0.62 } : undefined}
      >
        <View
          className="w-1 self-stretch rounded-full"
          style={{
            backgroundColor: isChecking
              ? withAlpha(account.color, 0.45)
              : account.color,
            marginVertical: 2,
          }}
        />

        <View
          className="size-11 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: isChecking
              ? "transparent"
              : withAlpha(account.color, theme.isDark ? 0.22 : 0.13),
            borderWidth: isChecking ? 1.5 : 1,
            borderStyle: isChecking ? "dashed" : "solid",
            borderColor: withAlpha(
              account.color,
              isChecking ? 0.72 : 0.26,
            ),
            borderCurve: "continuous",
          }}
        >
          <AccountIcon
            color={account.color}
            name={account.icon}
            pathData={account.iconPath}
            size={21}
          />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              className="min-w-0 shrink font-manrope-bold text-[15px] leading-[20px] text-foreground"
              numberOfLines={1}
            >
              {account.name}
            </Text>
            <StatusBadges
              isDefault={account.isDefault}
              isExcluded={account.isExcluded}
            />
          </View>

          <View className="flex-row items-center gap-1.5">
            <View
              className="shrink-0 rounded-md px-1.5 py-0.5"
              style={{
                backgroundColor: isChecking
                  ? colorWithAlpha(theme.accent, theme.isDark ? 0.2 : 0.12)
                  : theme.surfaceSecondary,
              }}
            >
              <Text
                className={`font-manrope-semibold text-[10px] leading-[13px] ${
                  isChecking ? "text-accent" : "text-muted"
                }`}
              >
                {t(`accounts.common.kinds.${account.kind}`)}
              </Text>
            </View>
            {detailText ? (
              <Text
                className="min-w-0 flex-1 font-sans text-[12px] leading-[16px] text-muted"
                numberOfLines={1}
              >
                {detailText}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="ms-1 max-w-[42%] shrink-0 flex-row items-center gap-1.5">
          <Text
            adjustsFontSizeToFit
            className={`text-right font-manrope-bold text-[16px] leading-[21px] ${
              showNegative ? "text-danger" : "text-foreground"
            }`}
            minimumFontScale={0.72}
            numberOfLines={1}
            style={TABULAR}
          >
            {showNegative ? "−" : ""}
            {formatCurrency(account.balance, account.currencyCode)}
          </Text>
          <FilledIcon name="chevron-right" size={16} tone="muted" />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Liquid Cash wallet strip: circular coin emblem, soft diagonal color wash,
 * Cash pill, and subtle trailing watermark.
 */
function CashWalletCard({
  account,
  onPress,
}: {
  account: Account;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { amountsHidden, formatCurrency } = useCurrencyFormat();
  const showNegative = !amountsHidden && account.balance < 0;
  const noteText =
    account.bankName ||
    (account.institution && account.institution !== t("common.localAccount")
      ? account.institution
      : "");
  const cashPillColor = theme.isDark
    ? isLightColor(account.color)
      ? account.color
      : lighten(account.color, 0.45)
    : isLightColor(account.color)
      ? darken(account.color, 0.5)
      : darken(account.color, 0.14);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.list.viewDetails", { name: account.name })}
      onPress={onPress}
      className="overflow-hidden rounded-[22px] border bg-surface"
      style={({ pressed }) => ({
        opacity: pressed ? 0.68 : 1,
        borderColor: withAlpha(account.color, theme.isDark ? 0.34 : 0.3),
        borderCurve: "continuous",
      })}
    >
      <LinearGradient
        colors={[
          withAlpha(account.color, theme.isDark ? 0.2 : 0.13),
          withAlpha(account.color, theme.isDark ? 0.05 : 0.02),
        ]}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        pointerEvents="none"
        className="absolute -bottom-3 -end-2"
        style={{ transform: [{ rotate: "-12deg" }] }}
      >
        <AccountIcon
          color={withAlpha(account.color, theme.isDark ? 0.13 : 0.09)}
          name={account.icon}
          pathData={account.iconPath}
          size={68}
        />
      </View>

      <View
        className="flex-row items-center gap-3 px-4 py-3.5"
        style={account.isExcluded ? { opacity: 0.62 } : undefined}
      >
        <View
          className="size-11 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: account.color,
            borderWidth: 2,
            borderColor: withAlpha("#ffffff", theme.isDark ? 0.22 : 0.65),
          }}
        >
          <AccountIcon
            color={colorForeground(account.color)}
            name={account.icon}
            pathData={account.iconPath}
            size={20}
          />
        </View>

        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              className="min-w-0 shrink font-manrope-bold text-[15px] leading-[20px] text-foreground"
              numberOfLines={1}
            >
              {account.name}
            </Text>
            <StatusBadges
              isDefault={account.isDefault}
              isExcluded={account.isExcluded}
            />
          </View>

          <View className="flex-row items-center gap-1.5">
            <View
              className="shrink-0 rounded-full px-2 py-0.5"
              style={{
                backgroundColor: withAlpha(
                  account.color,
                  theme.isDark ? 0.25 : 0.16,
                ),
              }}
            >
              <Text
                className="font-manrope-semibold text-[10px] leading-[13px]"
                style={{ color: cashPillColor }}
              >
                {t("accounts.common.kinds.cash")}
              </Text>
            </View>
            {noteText ? (
              <Text
                className="min-w-0 flex-1 font-sans text-[12px] leading-[16px] text-muted"
                numberOfLines={1}
              >
                {noteText}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="ms-1 max-w-[44%] shrink-0 flex-row items-center gap-1.5">
          <Text
            adjustsFontSizeToFit
            className={`text-right font-manrope-bold text-[17px] leading-[22px] ${
              showNegative ? "text-danger" : "text-foreground"
            }`}
            minimumFontScale={0.72}
            numberOfLines={1}
            style={TABULAR}
          >
            {showNegative ? "−" : ""}
            {formatCurrency(account.balance, account.currencyCode)}
          </Text>
          <FilledIcon name="chevron-right" size={16} tone="muted" />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Glossy gradient plastic credit card replicating the card palette language:
 * issuer glass badge, masked last-4 digits, cycle spend, status pill, and limit track.
 */
function CreditListCard({
  account,
  onPress,
}: {
  account: Account;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { amountsHidden, formatCurrency } = useCurrencyFormat();
  const { formatDayMonth } = useAppDate();
  const palette = cardPalette(account.color);

  const hasCreditLimit = (account.creditLimit ?? 0) > 0;
  const tracksCycle = hasCreditLimit || !!account.billingCycle;
  const primaryAmount = tracksCycle ? account.currentSpent : account.balance;
  const isNegative = !tracksCycle && account.balance < 0;
  const showNegative = !amountsHidden && isNegative;

  const caption = tracksCycle
    ? t("accounts.cards.spentThisCycle")
    : isNegative
      ? t("accounts.cards.currentDebt")
      : t("accounts.cards.currentBalance");

  const subtitleParts = [
    account.cardCompany || t("accounts.cards.creditCard"),
    account.lastFour ? `•• ${account.lastFour}` : "",
    account.linkedBankAccountName || "",
  ].filter(Boolean);

  let statusText: string | null = null;
  if (account.isOverdraft) {
    statusText = t("accounts.cards.overdraft", {
      amount: formatCurrency(account.overdraftAmount, account.currencyCode),
    });
  } else if (hasCreditLimit) {
    statusText = t("accounts.list.availableAmount", {
      amount: formatCurrency(
        Math.max(0, account.availableCredit ?? 0),
        account.currencyCode,
      ),
    });
  } else if (account.billingCycle) {
    statusText = t("accounts.list.paysOn", {
      date: formatDayMonth(account.billingCycle.nextPaymentDate),
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.list.viewDetails", { name: account.name })}
      onPress={onPress}
      className="overflow-hidden rounded-[22px] border"
      style={({ pressed }) => ({
        opacity: pressed ? 0.78 : 1,
        borderColor: palette.hairline,
        borderCurve: "continuous",
      })}
    >
      <LinearGradient
        colors={palette.gradient}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View
        pointerEvents="none"
        className="absolute -end-8 -top-12 size-36 rounded-full"
        style={{
          backgroundColor: withAlpha(
            palette.light ? "#000000" : "#ffffff",
            0.08,
          ),
        }}
      />
      <View
        pointerEvents="none"
        className="absolute -bottom-12 -start-6 size-28 rounded-full"
        style={{
          backgroundColor: withAlpha(
            palette.light ? "#000000" : "#ffffff",
            0.06,
          ),
        }}
      />

      <View
        className="gap-3 p-4"
        style={account.isExcluded ? { opacity: 0.65 } : undefined}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row items-center gap-1.5">
              <Text
                className="min-w-0 shrink font-manrope-bold text-[16px] leading-[21px]"
                numberOfLines={1}
                style={{ color: palette.ink }}
              >
                {account.name}
              </Text>
              {account.isDefault ? (
                <View
                  className="shrink-0 rounded-full border px-2 py-0.5"
                  style={{
                    backgroundColor: palette.glassFill,
                    borderColor: palette.glassBorder,
                  }}
                >
                  <Text
                    className="font-manrope-semibold text-[10px] leading-[13px]"
                    style={{ color: palette.ink }}
                  >
                    {t("accounts.common.badges.default")}
                  </Text>
                </View>
              ) : null}
              {account.isExcluded ? (
                <View
                  className="shrink-0 rounded-full border px-1.5 py-0.5"
                  style={{
                    backgroundColor: palette.glassFill,
                    borderColor: palette.glassBorder,
                  }}
                >
                  <FilledIcon
                    color={palette.ink}
                    name="eye-off"
                    size={11}
                  />
                </View>
              ) : null}
            </View>

            <Text
              className="font-sans text-[12px] leading-[16px]"
              numberOfLines={1}
              style={{ color: palette.inkMuted }}
            >
              {subtitleParts.join(" · ")}
            </Text>
          </View>

          <CardCompanyLogo
            company={account.cardCompany}
            height={30}
            palette={palette}
            width={48}
          />
        </View>

        <View className="flex-row items-end justify-between gap-2 pt-0.5">
          <View className="min-w-0 shrink gap-0.5">
            <Text
              className="font-manrope-medium text-[11px] leading-[14px]"
              numberOfLines={1}
              style={{ color: palette.inkMuted }}
            >
              {caption}
            </Text>
            <Text
              adjustsFontSizeToFit
              className="font-manrope-bold text-[22px] leading-[26px]"
              minimumFontScale={0.7}
              numberOfLines={1}
              style={[TABULAR, { color: palette.ink }]}
            >
              {showNegative ? "−" : ""}
              {formatCurrency(primaryAmount, account.currencyCode)}
            </Text>
          </View>

          <View className="max-w-[56%] shrink-0 flex-row items-center gap-1.5">
            {statusText ? (
              <View
                className="min-w-0 shrink rounded-full border px-2.5 py-1"
                style={
                  account.isOverdraft
                    ? {
                        backgroundColor: "#dc2626",
                        borderColor: "rgba(255,255,255,0.28)",
                      }
                    : {
                        backgroundColor: palette.glassFill,
                        borderColor: palette.glassBorder,
                      }
                }
              >
                <Text
                  adjustsFontSizeToFit
                  className="text-right font-manrope-semibold text-[11px] leading-[15px]"
                  minimumFontScale={0.82}
                  numberOfLines={1}
                  style={[
                    TABULAR,
                    { color: account.isOverdraft ? "#ffffff" : palette.ink },
                  ]}
                >
                  {statusText}
                </Text>
              </View>
            ) : null}
            <FilledIcon
              color={palette.inkMuted}
              name="chevron-right"
              size={16}
            />
          </View>
        </View>

        {hasCreditLimit && (
          <View className="flex-row items-center gap-2">
            <View
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
              style={{ backgroundColor: palette.hairline }}
            >
              <View
                className="h-full rounded-full"
                style={{
                  backgroundColor: account.isOverdraft
                    ? "#ef4444"
                    : palette.ink,
                  width: `${
                    account.isOverdraft
                      ? 100
                      : Math.min(Math.max(account.creditUtilization, 0), 100)
                  }%`,
                }}
              />
            </View>
            <Text
              className="shrink-0 font-manrope-semibold text-[10px] leading-[13px]"
              style={[TABULAR, { color: palette.inkMuted }]}
            >
              {account.creditUtilization.toLocaleString(i18n.resolvedLanguage)}%
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Emerald growth vault card for Savings accounts: green-washed border/surface,
 * APY or earnings pill, principal-vs-growth composition bar, and corner watermark.
 */
function SavingsListCard({
  account,
  onPress,
}: {
  account: Account;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { amountsHidden, formatCurrency, formatSignedCurrency } =
    useCurrencyFormat();

  const summary = account.savingsSummary;
  const isDetailed = summary?.isDetailed === true;
  const rate = summary?.expectedAnnualReturnRate ?? 0;
  const earnings = summary?.earnings ?? 0;
  const principal = summary?.principal ?? Math.max(account.balance, 0);
  const compositionTotal = Math.max(principal, 0) + Math.max(earnings, 0);
  const principalShare =
    compositionTotal > 0 ? Math.max(principal, 0) / compositionTotal : 1;

  const showNegative = !amountsHidden && account.balance < 0;
  const growthInk = theme.isDark ? GROWTH : GROWTH_LIGHT_INK;

  const provider =
    summary?.providerName ||
    (account.institution && account.institution !== t("common.localAccount")
      ? account.institution
      : "");
  const product = summary?.productLabel;
  const subtitleParts =
    provider && product && provider !== product
      ? [provider, product]
      : [provider || product || t("accounts.common.kinds.savings")];

  const yieldBadgeText = rate
    ? t("accounts.list.perYear", { rate })
    : isDetailed && earnings !== 0
      ? formatSignedCurrency(earnings, account.currencyCode)
      : t("accounts.common.kinds.savings");

  const showInlineEarnings = isDetailed && rate > 0 && earnings !== 0;
  const yieldIsNegative = !rate && isDetailed && earnings < 0;
  const yieldToneColor = yieldIsNegative ? theme.danger : growthInk;
  const yieldBgColor = yieldIsNegative
    ? colorWithAlpha(theme.danger, theme.isDark ? 0.2 : 0.12)
    : withAlpha(GROWTH, theme.isDark ? 0.18 : 0.14);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.list.viewDetails", { name: account.name })}
      onPress={onPress}
      className="overflow-hidden rounded-[24px] border bg-surface"
      style={({ pressed }) => ({
        opacity: pressed ? 0.68 : 1,
        borderColor: withAlpha(GROWTH, theme.isDark ? 0.28 : 0.36),
        borderCurve: "continuous",
      })}
    >
      <LinearGradient
        colors={[
          withAlpha(GROWTH, theme.isDark ? 0.14 : 0.11),
          withAlpha(account.color, theme.isDark ? 0.06 : 0.04),
          "transparent",
        ]}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" className="absolute -bottom-3 -end-2">
        <AccountIcon
          color={withAlpha(GROWTH, theme.isDark ? 0.1 : 0.09)}
          name={account.icon}
          pathData={account.iconPath}
          size={76}
        />
      </View>

      <View
        className="gap-3 p-4"
        style={account.isExcluded ? { opacity: 0.62 } : undefined}
      >
        <View className="flex-row items-center gap-3">
          <View
            className="size-11 shrink-0 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: account.color,
              borderCurve: "continuous",
            }}
          >
            <AccountIcon
              color={colorForeground(account.color)}
              name={account.icon}
              pathData={account.iconPath}
              size={21}
            />
          </View>

          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row items-center gap-1.5">
              <Text
                className="min-w-0 shrink font-manrope-bold text-[15px] leading-[20px] text-foreground"
                numberOfLines={1}
              >
                {account.name}
              </Text>
              <StatusBadges
                isDefault={account.isDefault}
                isExcluded={account.isExcluded}
              />
            </View>
            <Text
              className="font-sans text-[12px] leading-[16px] text-muted"
              numberOfLines={1}
            >
              {subtitleParts.join(" · ")}
            </Text>
          </View>

          <View
            className="shrink-0 flex-row items-center gap-1 rounded-full px-2.5 py-1"
            style={{ backgroundColor: yieldBgColor }}
          >
            <FilledIcon
              color={yieldToneColor}
              name={yieldIsNegative ? "trending-down" : "trending-up"}
              size={12}
            />
            <Text
              className="font-manrope-semibold text-[11px] leading-[15px]"
              style={[TABULAR, { color: yieldToneColor }]}
            >
              {yieldBadgeText}
            </Text>
          </View>
        </View>

        <View className="flex-row items-end justify-between gap-2">
          <View className="min-w-0 shrink gap-0.5">
            <Text
              className="font-sans text-[11px] leading-[15px] text-muted"
              numberOfLines={1}
            >
              {isDetailed
                ? t("accounts.cards.currentSavingsValue")
                : t("accounts.cards.currentSavingsBalance")}
            </Text>
            <Text
              adjustsFontSizeToFit
              className={`font-manrope-bold text-[20px] leading-[25px] ${
                showNegative ? "text-danger" : "text-foreground"
              }`}
              minimumFontScale={0.72}
              numberOfLines={1}
              style={TABULAR}
            >
              {showNegative ? "−" : ""}
              {formatCurrency(account.balance, account.currencyCode)}
            </Text>
          </View>

          <View className="max-w-[46%] shrink-0 flex-row items-center gap-1.5">
            {showInlineEarnings ? (
              <Text
                adjustsFontSizeToFit
                className="text-right font-manrope-semibold text-[12px] leading-[16px]"
                minimumFontScale={0.8}
                numberOfLines={1}
                style={[
                  TABULAR,
                  { color: earnings < 0 ? theme.danger : growthInk },
                ]}
              >
                {formatSignedCurrency(earnings, account.currencyCode)}
              </Text>
            ) : null}
            <FilledIcon name="chevron-right" size={16} tone="muted" />
          </View>
        </View>

        {isDetailed && (principal > 0 || earnings > 0) && (
          <View className="flex-row gap-1 overflow-hidden rounded-full bg-surface-secondary">
            <View
              style={{
                backgroundColor: account.color,
                flex: Math.max(principalShare, 0.04),
                height: 5,
                borderRadius: 999,
              }}
            />
            {earnings > 0 ? (
              <View
                style={{
                  backgroundColor: GROWTH,
                  flex: Math.max(1 - principalShare, 0.04),
                  height: 5,
                  borderRadius: 999,
                }}
              />
            ) : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function StatusBadges({
  isDefault,
  isExcluded,
}: {
  isDefault: boolean;
  isExcluded: boolean;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  if (!isDefault && !isExcluded) return null;

  return (
    <>
      {isDefault ? (
        <View
          className="shrink-0 rounded-full px-2 py-0.5"
          style={{
            backgroundColor: colorWithAlpha(
              theme.accent,
              theme.isDark ? 0.22 : 0.14,
            ),
          }}
        >
          <Text className="font-manrope-semibold text-[10px] leading-[13px] text-accent">
            {t("accounts.common.badges.default")}
          </Text>
        </View>
      ) : null}
      {isExcluded ? (
        <View className="shrink-0 flex-row items-center justify-center rounded-full bg-surface-secondary px-1.5 py-0.5">
          <FilledIcon name="eye-off" size={11} tone="muted" />
        </View>
      ) : null}
    </>
  );
}
