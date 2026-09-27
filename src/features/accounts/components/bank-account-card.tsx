import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { colorForeground } from "../account-options";
import { withAlpha } from "../lib/card-color";
import type { Account } from "../types";
import { AccountIcon } from "./account-icon";

const INCOME = "#82d6a1";
const EXPENSE = "#ef8175";

export function BankAccountCard({
  account,
  showDetails = false,
}: {
  account: Account;
  showDetails?: boolean;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const net = account.monthlyIncome - account.monthlyExpense;
  const flow = account.monthlyIncome + account.monthlyExpense;
  const incomeShare = flow > 0 ? account.monthlyIncome / flow : 0.5;

  const badges = [
    account.isDefault ? t("accounts.common.badges.default") : "",
    account.isExcluded ? t("accounts.common.badges.excluded") : "",
  ].filter(Boolean);

  const kindLabels: Record<Account["kind"], string> = {
    bank: t("accounts.common.kinds.bank"),
    checking: t("accounts.common.kinds.checking"),
    savings: t("accounts.common.kinds.savings"),
    cash: t("accounts.common.kinds.cash"),
    credit: t("accounts.common.kinds.credit"),
  };

  const institution =
    account.bankName ||
    account.institution ||
    t("accounts.common.details.localAccount");

  const frontCard = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: withAlpha(account.color, 0.24),
        },
      ]}
    >
      <LinearGradient
        colors={[
          withAlpha(account.color, 0.16),
          withAlpha(account.color, 0.05),
          withAlpha(account.color, 0.02),
        ]}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

          {/* Ambient watermark seal */}
          <View pointerEvents="none" style={styles.watermark}>
            <AccountIcon
              color={withAlpha(account.color, 0.06)}
              name={account.icon}
              pathData={account.iconPath}
              size={140}
            />
          </View>

          {/* Header: Icon, Identity & Badges */}
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: account.color }]}>
              <AccountIcon
                color={colorForeground(account.color)}
                name={account.icon}
                pathData={account.iconPath}
                size={24}
              />
            </View>
            <View style={styles.identity}>
              <Text
                className="font-manrope-bold text-base text-foreground"
                numberOfLines={1}
              >
                {account.name}
              </Text>
              <Text
                className="font-manrope-medium text-xs text-muted"
                numberOfLines={1}
              >
                {institution} · {kindLabels[account.kind]}
              </Text>
            </View>
            {badges.length > 0 && (
              <View style={styles.badges}>
                {badges.map((badge) => (
                  <View
                    key={badge}
                    style={[
                      styles.badge,
                      {
                        backgroundColor: withAlpha(account.color, 0.14),
                        borderColor: withAlpha(account.color, 0.28),
                      },
                    ]}
                  >
                    <Text
                      className="font-manrope-semibold text-[10px]"
                      style={{ color: account.color }}
                    >
                      {badge}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Hero Balance Block */}
          <View style={styles.balanceBlock}>
            <Text
              className="font-manrope-medium text-[10px] text-muted"
              style={styles.overline}
            >
              {t("accounts.cards.currentBalance")}
            </Text>
            <Text
              adjustsFontSizeToFit
              className="font-manrope-bold text-3xl text-foreground"
              minimumFontScale={0.68}
              numberOfLines={1}
              style={account.balance < 0 ? { color: EXPENSE } : undefined}
            >
              {account.balance < 0 ? "−" : ""}
              {formatCurrency(account.balance, account.currencyCode)}
            </Text>
          </View>

          {/* Details Chips */}
          <View style={styles.chipsRow}>
            {!!account.accountNumber && (
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: withAlpha(account.color, 0.1),
                    borderColor: withAlpha(account.color, 0.22),
                  },
                ]}
              >
                <FilledIcon color={account.color} name="bank" size={12} />
                <Text
                  className="font-manrope-semibold text-xs text-foreground"
                  style={styles.chipText}
                >
                  •••• {account.accountNumber.slice(-4)}
                </Text>
              </View>
            )}
            {!!account.ownerName && (
              <View
                style={[
                  styles.chip,
                  {
                    backgroundColor: withAlpha(account.color, 0.1),
                    borderColor: withAlpha(account.color, 0.22),
                  },
                ]}
              >
                <FilledIcon color={account.color} name="account" size={12} />
                <Text
                  className="font-manrope-medium text-xs text-foreground"
                  numberOfLines={1}
                  style={styles.chipText}
                >
                  {account.ownerName}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: withAlpha(account.color, 0.08),
                  borderColor: withAlpha(account.color, 0.18),
                },
              ]}
            >
              <Text
                className="font-manrope-semibold text-[11px]"
                style={{ color: account.color }}
              >
                {account.currencyCode}
              </Text>
            </View>
          </View>
        </View>
  );

  if (!showDetails) {
    return frontCard;
  }

  return (
    <View style={styles.container}>
      {/* Back Card (Tray holding the bottom data) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.backCard,
          {
            backgroundColor: theme.isDark ? "#282a2f" : "#2f3237",
          },
        ]}
      />

      {/* Front Card with Drop Shadow */}
      <View
        style={[
          styles.frontShadow,
          {
            backgroundColor: theme.surface,
          },
        ]}
      >
        {frontCard}
      </View>

      {/* Back Card Content (Data under the card) */}
      <View style={styles.bottomContent}>
        {flow > 0 && (
          <View style={styles.flowBar}>
            <View
              style={[
                styles.flowSegment,
                { backgroundColor: INCOME, flex: Math.max(incomeShare, 0.03) },
              ]}
            />
            <View
              style={[
                styles.flowSegment,
                {
                  backgroundColor: EXPENSE,
                  flex: Math.max(1 - incomeShare, 0.03),
                },
              ]}
            />
          </View>
        )}

        <View style={styles.stats}>
          <Stat
            color={INCOME}
            currencyCode={account.currencyCode}
            icon="arrow-bottom-left"
            label={t("accounts.cards.income")}
            value={account.monthlyIncome}
          />
          <View style={styles.statDivider} />
          <Stat
            color={EXPENSE}
            currencyCode={account.currencyCode}
            icon="arrow-top-right"
            label={t("accounts.cards.expenses")}
            value={account.monthlyExpense}
          />
          <View style={styles.statDivider} />
          <Stat
            color={net < 0 ? EXPENSE : INCOME}
            currencyCode={account.currencyCode}
            icon={net < 0 ? "trending-down" : "trending-up"}
            label={t("accounts.cards.net")}
            prefix={net < 0 ? "−" : net > 0 ? "+" : ""}
            value={net}
          />
        </View>
      </View>
    </View>
  );
}

function Stat({
  color,
  currencyCode,
  icon,
  label,
  prefix = "",
  value,
}: {
  color: string;
  currencyCode: string;
  icon:
    "arrow-bottom-left" | "arrow-top-right" | "trending-up" | "trending-down";
  label: string;
  prefix?: string;
  value: number;
}) {
  const { formatCurrency } = useCurrencyFormat();
  return (
    <View style={styles.stat}>
      <View style={styles.statLabel}>
        <FilledIcon color={color} name={icon} size={13} />
        <Text
          className="font-manrope-medium text-[10px]"
          numberOfLines={1}
          style={[styles.overline, { color: "rgba(255, 255, 255, 0.7)" }]}
        >
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        className="font-manrope-bold text-base"
        minimumFontScale={0.72}
        numberOfLines={1}
        style={{ color }}
      >
        {prefix}
        {formatCurrency(value, currencyCode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backCard: {
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 24,
    borderWidth: 1,
    zIndex: 0,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badges: {
    alignItems: "flex-end",
    gap: 4,
  },
  balanceBlock: {
    gap: 4,
  },
  bottomContent: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 1,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 16,
    overflow: "hidden",
    padding: 18,
  },
  chip: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chipText: {
    letterSpacing: 0.2,
  },
  container: {
    borderRadius: 24,
    overflow: "visible",
    position: "relative",
  },
  flowBar: {
    borderRadius: 999,
    flexDirection: "row",
    gap: 3,
    height: 4,
    marginBottom: 8,
    overflow: "hidden",
  },
  flowSegment: {
    borderRadius: 999,
    height: "100%",
  },
  frontShadow: {
    borderRadius: 22,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    zIndex: 2,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  icon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  overline: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  stat: {
    flex: 1,
    gap: 3,
  },
  statDivider: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    marginVertical: 2,
    width: 1,
  },
  statLabel: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  stats: {
    flexDirection: "row",
    gap: 12,
  },
  watermark: {
    bottom: -32,
    position: "absolute",
    right: -24,
    transform: [{ rotate: "-12deg" }],
  },
});
