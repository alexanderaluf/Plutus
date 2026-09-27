import { useAppDate } from "@/shared/lib/use-app-date";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import { cardPalette, withAlpha } from "../lib/card-color";
import type { Account } from "../types";
import { CardCompanyLogo } from "./card-company-logo";

const INCOME = "#82d6a1";
const EXPENSE = "#ef8175";
const WARNING = "#f59e0b";

export function CreditAccountCard({
  account,
  showDetails = false,
}: {
  account: Account;
  showDetails?: boolean;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDayMonth } = useAppDate();
  const { t, i18n } = useTranslation();
  const theme = useAppThemeColors();
  const palette = cardPalette(account.color);
  const owed = account.balance < 0;
  const hasCreditLimit =
    typeof account.creditLimit === "number" && account.creditLimit > 0;
  const monthLabel = new Date().toLocaleDateString(i18n.resolvedLanguage, {
    month: "long",
  });

  const cyclePeriodText = account.billingCycle
    ? t("accounts.cards.cyclePeriod", {
        start: formatDayMonth(account.billingCycle.cycleStart),
        end: formatDayMonth(account.billingCycle.cycleEnd),
      })
    : null;

  const nextPaydayFormatted = account.billingCycle
    ? formatDayMonth(account.billingCycle.nextPaymentDate)
    : account.paymentDay != null
      ? t("accounts.cards.paysDay", {
          day: String(account.paymentDay).padStart(2, "0"),
        })
      : null;

  const daysUntil = account.billingCycle?.daysUntilPayment;
  const daysCountdownText =
    daysUntil === 0
      ? t("accounts.cards.today")
      : daysUntil === 1
        ? t("accounts.cards.tomorrow")
        : typeof daysUntil === "number"
          ? t("accounts.cards.daysLeft", { days: daysUntil })
          : null;

  const debitNote =
    account.linkedBankAccountName && nextPaydayFormatted
      ? t("accounts.cards.debitsBank", {
          bank: account.linkedBankAccountName,
          date: nextPaydayFormatted,
        })
      : account.linkedBankAccountName || null;

  const frontCard = (
    <LinearGradient
      colors={palette.gradient}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={styles.face}
    >
      {/* Subtle Ambient Gloss Highlights */}
      <View
        pointerEvents="none"
        style={[
          styles.gloss,
          {
            backgroundColor: withAlpha(
              palette.light ? "#000000" : "#ffffff",
              0.09,
            ),
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glossSmall,
          {
            backgroundColor: withAlpha(
              palette.light ? "#000000" : "#ffffff",
              0.07,
            ),
          },
        ]}
      />

      {/* Top Header: Card Identity & Brand Logo */}
      <View style={styles.faceHeader}>
        <View style={styles.faceIdentity}>
          <Text
            className="font-manrope-bold text-lg"
            numberOfLines={1}
            style={{ color: palette.ink }}
          >
            {account.name}
          </Text>
          <Text
            className="font-manrope-medium text-xs"
            numberOfLines={1}
            style={[styles.overline, { color: palette.inkMuted }]}
          >
            {account.cardCompany || t("accounts.cards.creditCard")}
            {account.linkedBankAccountName
              ? ` · ${account.linkedBankAccountName}`
              : ""}
          </Text>
        </View>
        <CardCompanyLogo
          company={account.cardCompany}
          height={38}
          palette={palette}
          width={60}
        />
      </View>

      {/* Central Hero Amount & Quick Status */}
      <View style={styles.faceHeroBlock}>
        <Text
          className="font-manrope-medium text-[11px]"
          style={[styles.overline, { color: palette.inkMuted }]}
        >
          {hasCreditLimit || account.billingCycle
            ? t("accounts.cards.spentThisCycle")
            : owed
              ? t("accounts.cards.currentDebt")
              : t("accounts.cards.available")}
        </Text>

        <View style={styles.faceHeroAmountRow}>
          <Text
            adjustsFontSizeToFit
            className="font-manrope-bold text-3xl"
            minimumFontScale={0.7}
            numberOfLines={1}
            style={{ color: palette.ink }}
          >
            {hasCreditLimit || account.billingCycle
              ? formatCurrency(account.currentSpent, account.currencyCode)
              : `${owed ? "−" : ""}${formatCurrency(
                  Math.abs(account.balance),
                  account.currencyCode,
                )}`}
          </Text>

          {/* Status Pill on Front Card: ONLY place with overdraft text */}
          {hasCreditLimit && (
            <View
              style={[
                styles.faceStatusPill,
                account.isOverdraft
                  ? styles.faceStatusPillOverdraft
                  : {
                      backgroundColor: withAlpha(palette.ink, 0.12),
                      borderColor: palette.hairline,
                    },
              ]}
            >
              <Text
                className="font-manrope-semibold text-[11px]"
                numberOfLines={1}
                style={{
                  color: account.isOverdraft
                    ? "#ffffff"
                    : palette.light
                      ? "#137333"
                      : INCOME,
                }}
              >
                {account.isOverdraft
                  ? `${t("accounts.cards.overdraftTitle")}: −${formatCurrency(
                      account.overdraftAmount,
                      account.currencyCode,
                    )}`
                  : `${t("accounts.cards.availableCredit")}: ${formatCurrency(
                      account.availableCredit ?? 0,
                      account.currencyCode,
                    )}`}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Physical Card Details: EMV Chip, NFC, Masked PAN & Cardholder */}
      <View style={[styles.faceFooter, { borderTopColor: palette.hairline }]}>
        <View style={styles.chipPanGroup}>
          <LinearGradient
            colors={["#f6e6bb", "#c9a86a", "#efdcae"]}
            end={{ x: 1, y: 1 }}
            start={{ x: 0, y: 0 }}
            style={styles.chip}
          >
            <View style={styles.chipLine} />
            <View style={styles.chipLine} />
          </LinearGradient>
          <FilledIcon color={palette.inkMuted} name="nfc" size={18} />
          <Text
            className="font-manrope-semibold text-sm"
            style={[styles.pan, { color: palette.ink }]}
          >
            •••• {account.lastFour || "••••"}
          </Text>
        </View>
        <Text
          className="font-manrope-semibold text-[11px]"
          numberOfLines={1}
          style={[styles.overline, { color: palette.inkMuted }]}
        >
          {account.ownerName || t("accounts.cards.cardholder")}
        </Text>
      </View>
    </LinearGradient>
  );

  if (!showDetails) {
    return frontCard;
  }

  return (
    <View style={styles.container}>
      {/* Back Card Tray (The base card behind that catches the drop shadow) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.backCard,
          {
            backgroundColor: theme.isDark ? "#282a2f" : "#2f3237",
          },
        ]}
      />

      {/* Front Card with Layered Drop Shadow */}
      <View
        style={[
          styles.frontShadow,
          {
            backgroundColor: palette.gradient[1],
          },
        ]}
      >
        {frontCard}
      </View>

      {/* Back Card Tray Content (Structured Financial Intelligence Panel) */}
      <View style={styles.bottomContent}>
        {/* Section 1: Credit Frame Progress & Available Credit Badge */}
        {hasCreditLimit && (
          <View style={styles.frameSection}>
            <View style={styles.frameHeader}>
              <View style={styles.frameTitleRow}>
                <FilledIcon
                  color="rgba(255, 255, 255, 0.7)"
                  name="credit-card"
                  size={14}
                />
                <Text className="font-manrope-bold text-xs text-white">
                  {t("accounts.cards.frameUtilization")}
                </Text>
              </View>

              {/* Available credit badge in header instead of percentage */}
              <View
                style={[
                  styles.availableCreditBadge,
                  {
                    backgroundColor: account.isOverdraft
                      ? "rgba(239, 68, 68, 0.16)"
                      : account.creditUtilization >= 80
                        ? "rgba(245, 158, 11, 0.2)"
                        : "rgba(130, 214, 161, 0.16)",
                  },
                ]}
              >
                <Text
                  className="font-manrope-bold text-[11px]"
                  style={{
                    color: account.isOverdraft
                      ? EXPENSE
                      : account.creditUtilization >= 80
                        ? WARNING
                        : INCOME,
                  }}
                >
                  {`${t("accounts.cards.availableCredit")}: ${formatCurrency(
                    Math.max(0, account.availableCredit ?? 0),
                    account.currencyCode,
                  )}`}
                </Text>
              </View>
            </View>

            {/* Frame Progress Bar Track */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: account.isOverdraft
                      ? EXPENSE
                      : account.creditUtilization >= 80
                        ? WARNING
                        : INCOME,
                    width: `${Math.min(Math.max(account.creditUtilization, 0), 100)}%`,
                  },
                ]}
              />
            </View>

            {/* 2 Metric Pillars: Spent this cycle & Credit limit */}
            <View style={styles.metricPillarsRow}>
              <View style={styles.metricPillar}>
                <Text
                  className="font-manrope-medium text-[10px]"
                  numberOfLines={1}
                  style={[
                    styles.overline,
                    { color: "rgba(255, 255, 255, 0.65)" },
                  ]}
                >
                  {t("accounts.cards.spentThisCycle")}
                </Text>
                <Text
                  adjustsFontSizeToFit
                  className="font-manrope-bold text-base text-white"
                  minimumFontScale={0.8}
                  numberOfLines={1}
                >
                  {formatCurrency(account.currentSpent, account.currencyCode)}
                </Text>
              </View>

              <View style={styles.pillarDivider} />

              <View style={styles.metricPillar}>
                <Text
                  className="font-manrope-medium text-[10px]"
                  numberOfLines={1}
                  style={[
                    styles.overline,
                    { color: "rgba(255, 255, 255, 0.65)" },
                  ]}
                >
                  {t("accounts.cards.creditLimit")}
                </Text>
                <Text
                  adjustsFontSizeToFit
                  className="font-manrope-bold text-base text-white"
                  minimumFontScale={0.8}
                  numberOfLines={1}
                >
                  {formatCurrency(account.creditLimit!, account.currencyCode)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Section 2: Billing Cycle & Payday Settlement Panel */}
        {(cyclePeriodText || nextPaydayFormatted) && (
          <View style={styles.schedulePanel}>
            {cyclePeriodText && (
              <View style={styles.scheduleRow}>
                <View style={styles.scheduleIconLabel}>
                  <FilledIcon
                    color="rgba(255, 255, 255, 0.65)"
                    name="clock"
                    size={13}
                  />
                  <Text
                    className="font-manrope-medium text-xs"
                    style={{ color: "rgba(255, 255, 255, 0.7)" }}
                  >
                    {t("accounts.cards.billingCycle")}
                  </Text>
                </View>
                <Text className="font-manrope-semibold text-xs text-white">
                  {cyclePeriodText}
                </Text>
              </View>
            )}

            {cyclePeriodText && nextPaydayFormatted && (
              <View style={styles.scheduleDivider} />
            )}

            {nextPaydayFormatted && (
              <View style={styles.scheduleRow}>
                <View style={styles.scheduleIconLabel}>
                  <FilledIcon
                    color="rgba(255, 255, 255, 0.65)"
                    name="bank"
                    size={13}
                  />
                  <Text
                    className="font-manrope-medium text-xs"
                    numberOfLines={1}
                    style={{ color: "rgba(255, 255, 255, 0.7)", flexShrink: 1 }}
                  >
                    {debitNote || t("accounts.cards.paydayTitle")}
                  </Text>
                </View>

                <View style={styles.paydayCountdownBadge}>
                  <Text className="font-manrope-bold text-xs text-white">
                    {nextPaydayFormatted}
                  </Text>
                  {daysCountdownText && (
                    <Text className="font-manrope-medium text-[11px] text-white/70">
                      · {daysCountdownText}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Section 3: Cycle Activity (Income / Refunds & Expense / Charges) */}
        <View style={styles.activityRow}>
          <ActivityStat
            amount={
              account.billingCycle ? account.cycleIncome : account.monthlyIncome
            }
            color={INCOME}
            currencyCode={account.currencyCode}
            icon="arrow-bottom-left"
            label={
              account.billingCycle
                ? t("accounts.cards.cycleIncome")
                : t("accounts.cards.monthIncome", { month: monthLabel })
            }
            prefix="+"
          />
          <View style={styles.activityDivider} />
          <ActivityStat
            amount={
              account.billingCycle
                ? account.cycleExpense
                : account.monthlyExpense
            }
            color={EXPENSE}
            currencyCode={account.currencyCode}
            icon="arrow-top-right"
            label={
              account.billingCycle
                ? t("accounts.cards.cycleSpend")
                : t("accounts.cards.monthSpend", { month: monthLabel })
            }
          />
        </View>
      </View>
    </View>
  );
}

function ActivityStat({
  amount,
  color,
  currencyCode,
  icon,
  label,
  prefix = "",
}: {
  amount: number;
  color: string;
  currencyCode: string;
  icon: "arrow-bottom-left" | "arrow-top-right";
  label: string;
  prefix?: string;
}) {
  const { formatCurrency } = useCurrencyFormat();
  return (
    <View style={styles.activityStat}>
      <View style={styles.activityStatHeader}>
        <FilledIcon color={color} name={icon} size={13} />
        <Text
          className="font-manrope-medium text-[10px]"
          numberOfLines={1}
          style={[styles.overline, { color: "rgba(255, 255, 255, 0.65)" }]}
        >
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        className="font-manrope-bold text-lg"
        minimumFontScale={0.72}
        numberOfLines={1}
        style={{ color }}
      >
        {amount > 0 ? prefix : ""}
        {formatCurrency(amount, currencyCode)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  activityDivider: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginVertical: 2,
    width: 1,
  },
  activityRow: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  activityStat: { flex: 1, gap: 3 },
  activityStatHeader: { alignItems: "center", flexDirection: "row", gap: 5 },
  availableCreditBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  backCard: {
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 24,
    borderWidth: 1,
    zIndex: 0,
  },
  balanceBlock: { gap: 4, marginVertical: 4 },
  bottomContent: {
    gap: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    zIndex: 1,
  },
  chip: {
    alignItems: "center",
    borderRadius: 5,
    gap: 2.5,
    height: 20,
    justifyContent: "center",
    width: 28,
  },
  chipLine: {
    backgroundColor: "rgba(120, 92, 32, 0.55)",
    borderRadius: 1,
    height: 1.5,
    width: 16,
  },
  chipPanGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  container: {
    borderRadius: 24,
    overflow: "visible",
    position: "relative",
  },
  face: {
    aspectRatio: 1.586,
    borderRadius: 24,
    justifyContent: "space-between",
    minHeight: 215,
    overflow: "hidden",
    padding: 18,
  },
  faceFooter: {
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingTop: 10,
  },
  faceHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  faceHeroAmountRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  faceHeroBlock: {
    gap: 4,
    marginVertical: 4,
  },
  faceIdentity: { flex: 1, gap: 2 },
  faceStatusPill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  faceStatusPillOverdraft: {
    backgroundColor: "rgba(239, 68, 68, 0.88)",
    borderColor: "rgba(239, 68, 68, 1)",
  },
  frameHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  frameSection: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  frameTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  frontShadow: {
    borderRadius: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: {
      height: 10,
      width: 0,
    },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    zIndex: 2,
  },
  gloss: {
    borderRadius: 999,
    height: 260,
    position: "absolute",
    right: -90,
    top: -140,
    width: 260,
  },
  glossSmall: {
    borderRadius: 999,
    bottom: -110,
    height: 190,
    left: -70,
    position: "absolute",
    width: 190,
  },
  metricPillar: {
    flex: 1,
    gap: 2,
  },
  metricPillarsRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingTop: 4,
  },
  overline: { letterSpacing: 0.6, textTransform: "uppercase" },
  pan: { letterSpacing: 2 },
  paydayCountdownBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillarDivider: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 2,
    width: 1,
  },
  progressFill: {
    borderRadius: 999,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 999,
    height: 6,
    overflow: "hidden",
    width: "100%",
  },
  scheduleDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    height: StyleSheet.hairlineWidth,
  },
  scheduleIconLabel: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 7,
  },
  schedulePanel: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scheduleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
});
