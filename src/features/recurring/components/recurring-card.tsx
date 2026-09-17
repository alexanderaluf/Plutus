import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import type { Recurring } from "@/data/selectors/recurring-selectors";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { useAppDate } from "@/shared/lib/use-app-date";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { RecurringBadge } from "./recurring-ui";

export function RecurringCard({
  item,
  compact,
  busy,
  onProcess,
  onSkip,
}: {
  item: Recurring;
  compact: boolean;
  busy: boolean;
  onProcess: () => void;
  onSkip: () => void;
}) {
  const { formatCurrency } = useCurrencyFormat();
  const { formatDateTime } = useAppDate();
  const c = useAppThemeColors(),
    router = useRouter(),
    { t } = useTranslation();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colorWithAlpha(item.color, 0.25),
        backgroundColor: item.due ? c.surface : c.background,
        borderRadius: 24,
        padding: compact ? 12 : 16,
        gap: 12,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({ pathname: "/recurring/[id]", params: { id: item.id } })
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, gap: 12 })}
      >
        <View className="flex-row items-center gap-3">
          <RecurringBadge item={item} />
          <View className="flex-1 gap-1">
            <Text
              numberOfLines={2}
              className="font-manrope-bold text-lg text-foreground"
            >
              {item.name}
            </Text>
            <Text className="text-sm text-muted">
              {t(`recurring.periods.${item.period}`, {
                defaultValue: String(item.period),
              })}{" "}
              · {t(item.type === 1 ? "recurring.income" : "recurring.expense")}
            </Text>
          </View>
          <Text
            className="font-manrope-bold text-base"
            style={{ color: item.type === 1 ? c.success : c.danger }}
          >
            {formatCurrency(item.amount, item.currencyCode)}
            <Text className="text-xs"> {item.currencyCode}</Text>
          </Text>
        </View>
        {!compact && (
          <View className="flex-row items-center gap-2">
            <FilledIcon
              name="clock"
              size={17}
              tone={item.due ? "danger" : "muted"}
            />
            <Text className="flex-1 text-xs text-muted">
              {item.next
                ? `${t("recurring.next")} ${formatDateTime(item.next)}`
                : t(item.valid ? "recurring.ended" : "recurring.unsupported")}
            </Text>
            {item.automatic && (
              <FilledIcon name="swap-horizontal" size={18} tone="accent" />
            )}
          </View>
        )}
      </Pressable>
      {item.due && !item.archived && (
        <View className="flex-row justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            isDisabled={busy}
            onPress={onSkip}
          >
            <Button.Label>{t("recurring.skip")}</Button.Label>
          </Button>
          <Button
            size="sm"
            variant={item.type === 1 ? "primary" : "danger"}
            isDisabled={busy}
            onPress={onProcess}
          >
            <Button.Label>
              {t(busy ? "recurring.processing" : "recurring.process")}
            </Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}
