import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type CurrencyTotals = {
  currencyCode: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * Typographic net-worth hero. The first total is the profile currency; other
 * currencies are shown beside it, never converted. The theme accent marks
 * only the small label icon.
 */
export function AccountsOverview({
  totals,
  excludedCount,
}: {
  totals: CurrencyTotals[];
  excludedCount: number;
}) {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrencyFormat();
  const [primary, ...others] = totals;

  return (
    <View className="gap-3 px-1 pb-2">
      <View className="flex-row items-center gap-1.5">
        <FilledIcon name="wallet" size={16} tone="accent" />
        <Text className="font-manrope-semibold text-sm text-muted">
          {t("accounts.list.netWorth")}
        </Text>
      </View>

      {primary ? (
        <>
          <Text
            adjustsFontSizeToFit
            className={`font-manrope-bold text-[44px] leading-[50px] ${
              primary.netWorth < 0 ? "text-danger" : "text-foreground"
            }`}
            minimumFontScale={0.5}
            numberOfLines={1}
            style={TABULAR}
          >
            {primary.netWorth < 0 ? "−" : ""}
            {formatCurrency(primary.netWorth, primary.currencyCode)}
          </Text>

          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
            <Figure
              icon="arrow-bottom-left"
              label={t("accounts.summary.assets")}
              tone="success"
              value={formatCurrency(primary.assets, primary.currencyCode)}
            />
            {primary.liabilities > 0 && (
              <Figure
                icon="arrow-top-right"
                label={t("accounts.summary.liabilities")}
                tone="danger"
                value={formatCurrency(primary.liabilities, primary.currencyCode)}
              />
            )}
          </View>

          {others.length > 0 && (
            <View className="flex-row flex-wrap gap-2 pt-1">
              {others.map((item) => (
                <View
                  key={item.currencyCode}
                  className="flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5"
                >
                  <Text className="font-manrope-semibold text-xs text-muted">
                    {item.currencyCode}
                  </Text>
                  <Text
                    className={`font-manrope-bold text-xs ${
                      item.netWorth < 0 ? "text-danger" : "text-foreground"
                    }`}
                    style={TABULAR}
                  >
                    {item.netWorth < 0 ? "−" : ""}
                    {formatCurrency(item.netWorth, item.currencyCode)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <Text className="font-manrope-medium text-sm text-muted">
          {t("accounts.list.allExcluded")}
        </Text>
      )}

      {excludedCount > 0 && !!primary && (
        <Text className="font-manrope-medium text-xs text-muted">
          {t("accounts.list.excludedNote", { count: excludedCount })}
        </Text>
      )}
    </View>
  );
}

function Figure({
  icon,
  label,
  value,
  tone,
}: {
  icon: "arrow-bottom-left" | "arrow-top-right";
  label: string;
  value: string;
  tone: "success" | "danger";
}) {
  return (
    <View className="flex-row items-center gap-1">
      <FilledIcon name={icon} size={14} tone={tone} />
      <Text className="font-manrope-medium text-sm text-muted">{label}</Text>
      <Text
        className="font-manrope-bold text-sm text-foreground"
        style={TABULAR}
      >
        {value}
      </Text>
    </View>
  );
}
