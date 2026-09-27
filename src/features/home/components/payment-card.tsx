import { LinearGradient } from "expo-linear-gradient";
import { Card } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/shared/ui/app-text";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { FilledIcon } from "@/shared/ui/filled-icon";

import type { PaymentCardDetails } from "../types";
import { CardBrand } from "./card-brand";
import { EmvChip } from "./emv-chip";

type PaymentCardProps = {
  card: PaymentCardDetails;
  currencyCode?: string;
  isBalanceVisible: boolean;
  onToggleBalance: () => void;
};

export function PaymentCard({
  card,
  currencyCode = "USD",
  isBalanceVisible,
  onToggleBalance,
}: PaymentCardProps) {
  const { formatCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const visibilityIcon = isBalanceVisible ? "eye" : "eye-off";
  const numberGroups = ["••••", "••••", "••••", card.lastFour];
  const formattedBalance = formatCurrency(card.balance, currencyCode);

  return (
    <Card
      accessibilityLabel={t("home.paymentCard.accessibility", {
        brand: card.brand,
        lastFour: card.lastFour,
      })}
      className="overflow-hidden border border-white/10 bg-[#0f2a34] p-0"
      style={{ aspectRatio: 1.6 }}
    >
      <LinearGradient
        colors={["#1b4a58", "#11313d", "#0a1f27"]}
        end={{ x: 1, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0)"]}
        end={{ x: 0.9, y: 1 }}
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View className="flex-1 justify-between p-5">
        <View className="flex-row items-start justify-between">
          <View>
            <Text className="font-manrope-bold text-[15px] uppercase tracking-[2px] text-white">
              {card.issuer}
            </Text>
            <Text className="mt-1 font-sans text-[9px] uppercase tracking-[2px] text-white/50">
              {card.tier}
            </Text>
          </View>

          <CardBrand brand={card.brand} />
        </View>

        <View className="flex-row items-end justify-between">
          <View className="flex-row items-center gap-3">
            <EmvChip />
            <FilledIcon color="#ffffff" name="nfc" size={21} />
          </View>

          <View className="items-end">
            <View className="flex-row items-center gap-2">
              <Text className="font-sans text-[9px] uppercase tracking-[2px] text-white/50">
                {t("home.paymentCard.balance")}
              </Text>
              <Pressable
                accessibilityLabel={
                  isBalanceVisible
                    ? t("home.paymentCard.hideBalance")
                    : t("home.paymentCard.showBalance")
                }
                accessibilityRole="button"
                hitSlop={10}
                onPress={onToggleBalance}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <FilledIcon color="#ffffff" name={visibilityIcon} size={16} />
              </Pressable>
            </View>
            <Text
              accessibilityLabel={
                isBalanceVisible
                  ? t(
                      card.balance < 0
                        ? "home.paymentCard.availableBalanceNegative"
                        : "home.paymentCard.availableBalance",
                      { amount: formattedBalance },
                    )
                  : t("home.paymentCard.availableBalanceHidden")
              }
              className="mt-0.5 font-manrope-bold text-[26px] text-white"
              style={{ lineHeight: 31 }}
            >
              {isBalanceVisible
                ? `${card.balance < 0 ? "−" : ""}${formattedBalance}`
                : "••••••"}
            </Text>
          </View>
        </View>

        <View className="gap-3.5">
          <View className="flex-row items-center justify-between">
            {numberGroups.map((group, index) => (
              <Text
                key={`${group}-${index}`}
                className="font-manrope-semibold text-[17px] tracking-[2px] text-white"
              >
                {group}
              </Text>
            ))}
          </View>

          <View className="flex-row items-end justify-between">
            <View className="flex-1 pr-4">
              <Text className="font-sans text-[8px] uppercase tracking-[2px] text-white/45">
                {t("home.paymentCard.cardholder")}
              </Text>
              <Text
                className="mt-1 font-manrope-semibold text-[12px] uppercase tracking-[1.5px] text-white"
                numberOfLines={1}
              >
                {card.cardholder}
              </Text>
            </View>

            <View className="items-end">
              <Text className="font-sans text-[8px] uppercase tracking-[2px] text-white/45">
                {t("home.paymentCard.validThru")}
              </Text>
              <Text className="mt-1 font-manrope-semibold text-[12px] tracking-[1.5px] text-white">
                {card.expiresAt}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
