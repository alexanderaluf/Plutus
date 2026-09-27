import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { categoryEntrance } from "./category-motion";
import type { Category } from "@/data/selectors/category-selectors";
import type { CategoryType } from "@/data/model/category-record";
import { colorForeground } from "@/shared/icons/colors";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { RecordIcon } from "@/shared/ui/record-icon";
import {
  colorWithAlpha,
  useAppThemeColors,
} from "@/shared/theme/app-theme";

export const TYPE_COLORS = ["#ef666d", "#80c783", "#58b5f3"] as const;

export function CategoryHeader({
  title,
  children,
  disabled = false,
}: {
  title: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Animated.View
      entering={categoryEntrance()}
      className="flex-row items-center gap-2 px-3 py-2"
    >
      <Button
        isIconOnly
        isDisabled={disabled}
        variant="ghost"
        accessibilityLabel={t("categories.common.back")}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      >
        <FilledIcon name="arrow-left" size={26} />
      </Button>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="flex-1 font-manrope-bold text-2xl text-foreground"
      >
        {title}
      </Text>
      {children}
    </Animated.View>
  );
}

export function CategoryTypeSelector({
  blurTarget,
  minHeight,
  value,
  onChange,
}: {
  blurTarget?: RefObject<View | null>;
  minHeight?: number;
  value: CategoryType;
  onChange: (value: CategoryType) => void;
}) {
  const { t } = useTranslation();
  const options = [
    t("categories.common.types.expense"),
    t("categories.common.types.income"),
    t("categories.common.types.transfer"),
  ].map((label, optionValue) => ({
    label,
    value: optionValue as CategoryType,
  }));
  return (
    <GlassSegmentedControl
      accessibilityLabel={t("categories.common.transactionType")}
      blurTarget={blurTarget}
      minHeight={minHeight}
      onChange={onChange}
      options={options}
      textSize={16}
      value={value}
    />
  );
}

export function CategoryBadge({
  category,
  small = false,
}: {
  category: Category;
  small?: boolean;
}) {
  return (
    <View
      style={{
        width: small ? 30 : 56,
        height: small ? 30 : 56,
        borderRadius: small ? 9 : 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: category.color,
      }}
    >
      <RecordIcon
        name={category.icon}
        pathData={category.iconPath}
        color={colorForeground(category.color)}
        size={small ? 18 : 29}
      />
    </View>
  );
}

export function CategoryChip({
  category,
  selected,
  onPress,
  onLongPress,
}: {
  category?: Category;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useAppThemeColors();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      accessibilityHint={
        onLongPress ? t("categories.chip.deleteHint") : undefined
      }
      accessibilityActions={
        onLongPress
          ? [{ name: "delete", label: t("categories.chip.deleteAction") }]
          : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "delete") onLongPress?.();
      }}
      className="min-h-11 flex-row items-center gap-2 rounded-full border px-3 py-2"
      style={{
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected
          ? colorWithAlpha(theme.accent, 0.14)
          : theme.surface,
      }}
    >
      {category ? (
        <RecordIcon
          name={category.icon}
          pathData={category.iconPath}
          color={category.color}
          size={20}
        />
      ) : (
        <FilledIcon name="filter" size={20} tone="accent" />
      )}
      <Text
        className="font-manrope-medium text-sm"
        style={{ color: selected ? theme.accent : theme.foreground }}
      >
        {category?.name ?? t("categories.common.all")}
      </Text>
    </Pressable>
  );
}
