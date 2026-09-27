import { Card, Chip } from "heroui-native";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type AccountsSummaryCardProps = {
  currencyCode: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  monthlyChangePercent: number;
};

export function AccountsSummaryCard({
  assets,
  liabilities,
  netWorth,
  monthlyChangePercent,
  currencyCode,
}: AccountsSummaryCardProps) {
  const { formatCurrency } = useCurrencyFormat();
  const { t } = useTranslation();

  return (
    <Card className="border border-border bg-surface p-0">
      <Card.Header className="flex-row items-center justify-between px-5 pt-5">
        <View className="flex-row items-center gap-2">
          <FilledIcon name="shield-check" size={18} tone="accent" />
          <Text className="font-manrope-semibold text-xs uppercase tracking-widest text-muted">
            {t("accounts.summary.netWorth", { currency: currencyCode })}
          </Text>
        </View>
        <Chip color="success" size="sm" variant="soft">
          <FilledIcon name="arrow-top-right" size={15} tone="accent" />
          <Chip.Label className="font-manrope-bold">
            {monthlyChangePercent}%
          </Chip.Label>
        </Chip>
      </Card.Header>

      <Card.Body className="gap-6 px-5 pb-5 pt-3">
        <Text className="font-manrope-bold text-[34px] text-foreground">
          {netWorth < 0 ? "−" : ""}
          {formatCurrency(netWorth, currencyCode)}
        </Text>

        <View className="flex-row gap-3">
          <View className="flex-1 rounded-lg bg-surface-secondary p-3">
            <Text className="font-sans text-xs text-muted">
              {t("accounts.summary.assets")}
            </Text>
            <Text className="mt-1 font-manrope-bold text-base text-foreground">
              {formatCurrency(assets, currencyCode)}
            </Text>
          </View>
          <View className="flex-1 rounded-lg bg-surface-secondary p-3">
            <Text className="font-sans text-xs text-muted">
              {t("accounts.summary.liabilities")}
            </Text>
            <Text className="mt-1 font-manrope-bold text-base text-foreground">
              {formatCurrency(liabilities, currencyCode)}
            </Text>
          </View>
        </View>
      </Card.Body>
    </Card>
  );
}
