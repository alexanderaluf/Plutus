import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { formatCurrency } from "@/shared/lib/currency";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { colorForeground } from "../account-options";
import { withAlpha } from "../lib/card-color";
import type { Account } from "../types";
import { AccountIcon } from "./account-icon";

const GROWTH = "#82d6a1";

export function SavingsAccountCard({
  account,
  showDetails: _showDetails = false,
}: {
  account: Account;
  showDetails?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const summary = account.savingsSummary;

  if (summary && !summary.isDetailed) {
    return <SimpleSavingsAccountCard account={account} />;
  }

  const principal = summary?.principal ?? Math.max(account.balance, 0);
  const earnings = summary?.earnings ?? 0;
  const total = principal + earnings;
  const principalShare = total > 0 ? principal / total : 1;
  const monthlyFunding =
    (summary?.monthlyContribution ?? 0) +
    (summary?.employerMonthlyContribution ?? 0);
  const expectedRate = summary?.expectedAnnualReturnRate;
  const maturityDate = summary?.maturityDate;
  const liquidityLabel = summary?.liquidityLabel;
  const provider = summary?.providerName;
  const productLabel =
    summary?.productLabel ?? t("accounts.common.kinds.savings");

  return (
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
          withAlpha(GROWTH, 0.12),
          withAlpha(account.color, 0.08),
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

      {/* Header: Icon, Identity, APY Pill & Badges */}
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
            {provider ? `${provider} · ` : ""}
            {productLabel}
          </Text>
        </View>

        <View style={styles.headerBadges}>
          {!!expectedRate && (
            <View style={styles.yieldPill}>
              <FilledIcon color={GROWTH} name="trending-up" size={13} />
              <Text
                className="font-manrope-bold text-xs"
                style={{ color: GROWTH }}
              >
                {expectedRate}%
              </Text>
            </View>
          )}
          {account.isExcluded && (
            <View
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
                {t("accounts.common.badges.excluded")}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Hero Savings Value Block */}
      <View style={styles.balanceBlock}>
        <Text
          className="font-manrope-medium text-[10px] text-muted"
          style={styles.overline}
        >
          {t("accounts.cards.currentSavingsValue")}
        </Text>
        <Text
          adjustsFontSizeToFit
          className="font-manrope-bold text-3xl text-foreground"
          minimumFontScale={0.68}
          numberOfLines={1}
        >
          {formatCurrency(account.balance, account.currencyCode)}
        </Text>
      </View>

      {/* Wealth Composition Bar & Legend */}
      <View style={styles.compositionBlock}>
        <View style={styles.compositionHeader}>
          <Text
            className="font-manrope-medium text-[10px] text-muted"
            style={styles.overline}
          >
            {t("accounts.cards.valueComposition")}
          </Text>
          {earnings > 0 && (
            <Text
              className="font-manrope-semibold text-xs"
              style={{ color: GROWTH }}
            >
              +{formatCurrency(earnings, account.currencyCode)}
            </Text>
          )}
        </View>

        <View style={styles.compositionBar}>
          <View
            style={[
              styles.compositionSegment,
              {
                backgroundColor: account.color,
                flex: Math.max(principalShare, 0.03),
              },
            ]}
          />
          <View
            style={[
              styles.compositionSegment,
              {
                backgroundColor: GROWTH,
                flex: Math.max(1 - principalShare, 0.03),
              },
            ]}
          />
        </View>

        {/* Dot legends */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: account.color }]}
            />
            <Text className="font-manrope-medium text-xs text-muted">
              {t("accounts.cards.yourPrincipal")}:
            </Text>
            <Text className="font-manrope-bold text-xs text-foreground">
              {formatCurrency(principal, account.currencyCode)}
            </Text>
          </View>

          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: GROWTH }]} />
            <Text className="font-manrope-medium text-xs text-muted">
              {t("accounts.cards.earnedGrowth")}:
            </Text>
            <Text
              className="font-manrope-bold text-xs"
              style={{ color: GROWTH }}
            >
              {earnings >= 0 ? "+" : ""}
              {formatCurrency(earnings, account.currencyCode)}
            </Text>
          </View>
        </View>
      </View>

      {/* Terms & Funding Momentum Footer */}
      <View style={styles.footerRow}>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: withAlpha(account.color, 0.08),
              borderColor: withAlpha(account.color, 0.18),
            },
          ]}
        >
          <FilledIcon color={theme.muted} name="clock" size={13} />
          <Text
            className="font-manrope-medium text-xs text-muted"
            numberOfLines={1}
          >
            {maturityDate
              ? `${t("accounts.cards.matures")} ${maturityDate}`
              : (liquidityLabel ?? t("accounts.cards.accessNotSpecified"))}
          </Text>
        </View>

        {monthlyFunding > 0 && (
          <View
            style={[
              styles.pill,
              {
                backgroundColor: withAlpha(GROWTH, 0.12),
                borderColor: withAlpha(GROWTH, 0.25),
              },
            ]}
          >
            <FilledIcon color={GROWTH} name="arrow-top-right" size={13} />
            <Text
              className="font-manrope-semibold text-xs"
              style={{ color: GROWTH }}
            >
              {t("accounts.cards.perMonth", {
                amount: formatCurrency(monthlyFunding, account.currencyCode),
              })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SimpleSavingsAccountCard({ account }: { account: Account }) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();

  return (
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
          withAlpha(GROWTH, 0.1),
          withAlpha(account.color, 0.06),
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
            {t("accounts.common.kinds.savings")} · {account.currencyCode}
          </Text>
        </View>
        {account.isExcluded && (
          <View
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
              {t("accounts.common.badges.excluded")}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.balanceBlock}>
        <Text
          className="font-manrope-medium text-[10px] text-muted"
          style={styles.overline}
        >
          {t("accounts.cards.currentSavingsBalance")}
        </Text>
        <Text
          adjustsFontSizeToFit
          className="font-manrope-bold text-3xl text-foreground"
          minimumFontScale={0.68}
          numberOfLines={1}
        >
          {formatCurrency(account.balance, account.currencyCode)}
        </Text>
      </View>

      {(account.accountNumber || account.ownerName) && (
        <View style={styles.chipsRow}>
          {!!account.accountNumber && (
            <View
              style={[
                styles.pill,
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
                styles.pill,
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
              styles.pill,
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  balanceBlock: {
    gap: 4,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 16,
    overflow: "hidden",
    padding: 18,
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
  compositionBar: {
    borderRadius: 999,
    flexDirection: "row",
    gap: 3,
    height: 6,
    overflow: "hidden",
  },
  compositionBlock: {
    gap: 8,
  },
  compositionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  compositionSegment: {
    borderRadius: 999,
    height: "100%",
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  headerBadges: {
    alignItems: "flex-end",
    gap: 4,
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
  legendDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  legendItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  legendRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  overline: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  pill: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  watermark: {
    bottom: -32,
    position: "absolute",
    right: -24,
    transform: [{ rotate: "-12deg" }],
  },
  yieldPill: {
    alignItems: "center",
    backgroundColor: "rgba(130, 214, 161, 0.15)",
    borderColor: "rgba(130, 214, 161, 0.35)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
