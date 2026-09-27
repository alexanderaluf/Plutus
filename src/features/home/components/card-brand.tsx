import { View } from "react-native";

import { Text } from "@/shared/ui/app-text";

type CardBrandProps = {
  brand: "visa" | "mastercard" | "amex";
};

export function CardBrand({ brand }: CardBrandProps) {
  if (brand === "mastercard") {
    return (
      <View accessibilityLabel="Mastercard" className="flex-row items-center">
        <View className="size-6.5 rounded-full bg-[#eb5b4b]" />
        <View className="-ml-2.25 size-6.5 rounded-full bg-[#f5a623]/85" />
      </View>
    );
  }

  return (
    <Text
      accessibilityLabel={brand === "amex" ? "American Express" : "Visa"}
      className="font-manrope-bold text-[22px] italic tracking-[1px] text-white"
      style={{ lineHeight: 26 }}
    >
      {brand === "amex" ? "AMEX" : "VISA"}
    </Text>
  );
}
