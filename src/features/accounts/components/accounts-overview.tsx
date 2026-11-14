import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useAmountVisibility,
  useCurrencyFormat,
} from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type CurrencyTotals = {
  currencyCode: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

const TABULAR = { fontVariant: ["tabular-nums" as const] };

function RatioBar({
  assets,
  liabilities,
}: {
  assets: number;
  liabilities: number;
}) {
  const theme = useAppThemeColors();
  const total = Math.max(0, assets) + Math.max(0, liabilities);
  if (total <= 0) return null;

  const assetShare = Math.max(0, assets) / total;
  const liabilityShare = Math.max(0, liabilities) / total;

  return (
    <View
      accessible={false}
      className="h-2 w-full flex-row gap-1 overflow-hidden rounded-full bg-surface-secondary"
    >
      {assets > 0 ? (
        <View
          style={{
            backgroundColor: theme.success,
            borderRadius: 999,
            flex: Math.max(assetShare, 0.04),
            height: "100%",
          }}
        />
      ) : null}
      {liabilities > 0 ? (
        <View
          style={{
            backgroundColor: theme.danger,
            borderRadius: 999,
            flex: Math.max(liabilityShare, 0.04),
            height: "100%",
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Net-worth hero card. The first total is the profile currency; other
 * currencies are shown alongside it without implicit conversion.
 */
export function AccountsOverview({
  totals,
  excludedCount,
}: {
  totals: CurrencyTotals[];
  excludedCount: number;
}) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const { formatCurrency } = useCurrencyFormat();
  const { hidden, toggle } = useAmountVisibility();
  const [primary, ...others] = totals;

  const isNegative = primary ? primary.netWorth < 0 : false;
  const formattedNetWorth = primary
    ? `${!hidden && isNegative ? "−" : ""}${formatCurrency(
        primary.netWorth,
        primary.currencyCode,
      )}`
    : "";

  return (
    <View
      className="gap-4 overflow-hidden rounded-[28px] border border-border bg-surface p-5"
      style={{ borderCurve: "continuous" }}
    >
      <LinearGradient
        colors={[
          colorWithAlpha(theme.accent, theme.isDark ? 0.14 : 0.08),
          "transparent",
        ]}
        end={{ x: 0.9, y: 0.7 }}
        pointerEvents="none"
        start={{ x: 0.1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <View
            className="size-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: colorWithAlpha(theme.accent, 0.14),
              borderCurve: "continuous",
            }}
          >
            <FilledIcon name="wallet" size={18} tone="accent" />
          </View>
          <Text
            numberOfLines={1}
            className="min-w-0 shrink font-manrope-semibold text-[13px] leading-[18px] text-muted"
          >
            {t("accounts.list.netWorth")}
          </Text>
        </View>

        <View className="shrink-0 flex-row items-center gap-2">
          {primary ? (
            <View className="rounded-full bg-surface-secondary px-2.5 py-1">
              <Text className="font-manrope-semibold text-[11px] leading-[15px] text-muted">
                {primary.currencyCode}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => void toggle()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t(
              hidden
                ? "home.overview.showAmounts"
                : "home.overview.hideAmounts",
            )}
            className="size-9 items-center justify-center rounded-full border border-border/80 bg-surface-secondary/75"
            style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
          >
            <FilledIcon
              name={hidden ? "eye-off" : "eye"}
              size={17}
              tone="muted"
            />
          </Pressable>
        </View>
      </View>

      {primary ? (
        <>
          <Text
            adjustsFontSizeToFit
            className={`font-manrope-bold text-[38px] leading-[44px] tracking-[-0.6px] ${
              !hidden && isNegative ? "text-danger" : "text-foreground"
            }`}
            minimumFontScale={0.62}
            numberOfLines={1}
            selectable={!hidden}
            style={TABULAR}
          >
            {formattedNetWorth}
          </Text>

          <RatioBar
            assets={primary.assets}
            liabilities={primary.liabilities}
          />

          <View className="flex-row gap-2.5">
            <FigureTile
              dotColor={theme.success}
              label={t("accounts.summary.assets")}
              toneClass="text-foreground"
              value={formatCurrency(primary.assets, primary.currencyCode)}
            />
            <FigureTile
              dotColor={
                primary.liabilities > 0 ? theme.danger : theme.muted
              }
              label={t("accounts.summary.liabilities")}
              toneClass={
                !hidden && primary.liabilities > 0
                  ? "text-danger"
                  : "text-foreground"
              }
              value={formatCurrency(primary.liabilities, primary.currencyCode)}
            />
          </View>

          {others.length > 0 && (
            <View className="flex-row flex-wrap gap-2 border-t border-border/70 pt-3">
              {others.map((item) => {
                const otherNegative = !hidden && item.netWorth < 0;
                return (
                  <View
                    key={item.currencyCode}
                    className="flex-row items-center gap-1.5 rounded-xl border border-border/60 bg-surface-secondary/75 px-3 py-1.5"
                    style={{ borderCurve: "continuous" }}
                  >
                    <Text className="font-manrope-semibold text-[11px] leading-[15px] text-muted">
                      {item.currencyCode}
                    </Text>
                    <Text
                      className={`font-manrope-bold text-[13px] leading-[17px] ${
                        otherNegative ? "text-danger" : "text-foreground"
                      }`}
                      style={TABULAR}
                    >
                      {otherNegative ? "−" : ""}
                      {formatCurrency(item.netWorth, item.currencyCode)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <View className="rounded-2xl bg-surface-secondary/75 px-3.5 py-3">
          <Text className="font-sans text-[13px] leading-[19px] text-muted">
            {t("accounts.list.allExcluded")}
          </Text>
        </View>
      )}

      {excludedCount > 0 && !!primary && (
        <View className="flex-row items-center gap-1.5 pt-0.5">
          <FilledIcon name="eye-off" size={13} tone="muted" />
          <Text className="min-w-0 flex-1 font-sans text-[12px] leading-[16px] text-muted">
            {t("accounts.list.excludedNote", { count: excludedCount })}
          </Text>
        </View>
      )}
    </View>
  );
}

function FigureTile({
  dotColor,
  label,
  value,
  toneClass,
}: {
  dotColor: string;
  label: string;
  value: string;
  toneClass: string;
}) {
  return (
    <View
      className="min-w-0 flex-1 gap-1.5 rounded-2xl border border-border/50 bg-surface-secondary/75 p-3"
      style={{ borderCurve: "continuous" }}
    >
      <View className="flex-row items-center gap-1.5">
        <View
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <Text
          numberOfLines={1}
          className="min-w-0 flex-1 font-sans text-[11px] leading-[15px] text-muted"
        >
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        className={`font-manrope-bold text-[17px] leading-[22px] ${toneClass}`}
        style={TABULAR}
      >
        {value}
      </Text>
    </View>
  );
}
