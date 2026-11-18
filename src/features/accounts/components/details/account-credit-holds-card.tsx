import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import type { CreditHold } from "@/data/selectors/credit-hold-selectors";
import {
  CONTINUOUS,
  TABULAR,
} from "@/features/reports/components/report-primitives";
import { colorForeground } from "@/shared/icons/colors";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { FormDivider } from "@/shared/ui/form-ui";
import { RecordIcon } from "@/shared/ui/record-icon";

import { AnimatedMeter, CountPill, RowIcon } from "./detail-primitives";

const WARNING = "#f59e0b";

/**
 * What is holding this card's credit limit: each installment plan, how much
 * of it is still to be charged, and until when. Renders nothing when no plan
 * holds the limit.
 */
export function AccountCreditHoldsCard({
  items,
  total,
  currencyCode,
}: {
  items: CreditHold[];
  total: number;
  currencyCode: string;
}) {
  const { t } = useTranslation();
  if (!items.length) return null;

  return (
    <View
      className="gap-4 rounded-[24px] border border-border bg-surface p-4"
      style={CONTINUOUS}
    >
      <View className="flex-row items-center gap-3.5">
        <RowIcon name="lock" color={WARNING} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            className="font-manrope-bold text-[17px] leading-[22px] text-foreground"
          >
            {t("accounts.details.creditHolds.title")}
          </Text>
          <Text className="font-sans text-[12px] leading-[17px] text-muted">
            {t("accounts.details.creditHolds.description")}
          </Text>
        </View>
        <HeldTotal total={total} currencyCode={currencyCode} />
      </View>
      {items.map((hold) => (
        <View key={hold.recurringId} className="gap-4">
          <FormDivider />
          <HoldRow hold={hold} cardCurrency={currencyCode} />
        </View>
      ))}
    </View>
  );
}

function HeldTotal({
  total,
  currencyCode,
}: {
  total: number;
  currencyCode: string;
}) {
  const { formatCurrency } = useCurrencyFormat();
  return <CountPill label={formatCurrency(total, currencyCode)} color={WARNING} />;
}

function HoldRow({
  hold,
  cardCurrency,
}: {
  hold: CreditHold;
  cardCurrency: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppThemeColors();
  const { formatDate } = useAppDate();
  const { formatCurrency } = useCurrencyFormat();
  const foreign = hold.currencyCode !== cardCurrency;
  const held =
    hold.heldAmount === null
      ? formatCurrency(hold.remaining, hold.currencyCode)
      : formatCurrency(hold.heldAmount, cardCurrency);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("accounts.details.creditHolds.open", {
        name: hold.name,
      })}
      onPress={() =>
        router.push({
          pathname: "/recurring/[id]",
          params: { id: hold.recurringId },
        })
      }
      className="gap-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <View className="flex-row items-center gap-3.5">
        <View
          className="size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ ...CONTINUOUS, backgroundColor: hold.color }}
        >
          <RecordIcon
            name={hold.icon}
            pathData={hold.iconPath}
            color={colorForeground(hold.color)}
            size={20}
          />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text
            numberOfLines={1}
            className="font-manrope-semibold text-[15px] leading-[20px] text-foreground"
          >
            {hold.name}
          </Text>
          <Text
            numberOfLines={1}
            className="font-sans text-[12px] leading-[17px] text-muted"
            style={TABULAR}
          >
            {t("accounts.details.creditHolds.progress", {
              paid: hold.resolved,
              count: hold.count,
              amount: formatCurrency(hold.installmentAmount, hold.currencyCode),
            })}
          </Text>
        </View>
        <View className="shrink-0 items-end gap-0.5">
          <Text
            numberOfLines={1}
            className="font-manrope-bold text-[15px] leading-[20px] text-foreground"
            style={TABULAR}
          >
            {held}
          </Text>
          {hold.endsAt ? (
            <Text
              numberOfLines={1}
              className="font-sans text-[12px] leading-[17px] text-muted"
              style={TABULAR}
            >
              {t("accounts.details.creditHolds.until", {
                date: formatDate(hold.endsAt),
              })}
            </Text>
          ) : null}
        </View>
        <FilledIcon name="chevron-right" size={16} tone="muted" />
      </View>
      <AnimatedMeter
        fraction={hold.count > 0 ? hold.resolved / hold.count : 0}
        color={theme.accent}
        accessibilityLabel={t("recurring.installments.progress", {
          paid: hold.resolved,
          count: hold.count,
        })}
      />
      {foreign ? (
        <Text className="font-sans text-[12px] leading-[17px] text-muted">
          {hold.heldAmount === null
            ? t("accounts.details.creditHolds.noRate", {
                currency: cardCurrency,
              })
            : formatCurrency(hold.remaining, hold.currencyCode)}
        </Text>
      ) : null}
    </Pressable>
  );
}
