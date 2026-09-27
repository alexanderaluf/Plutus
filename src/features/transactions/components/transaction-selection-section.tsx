import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

export type TransactionOption = {
  id: string;
  name: string;
  description?: string;
  icon: string;
  iconPath?: string | null;
  color: string;
};

type TransactionSelectionSectionProps = {
  title: string;
  placeholder: string;
  icon: FilledIconName;
  options: TransactionOption[];
  selectedId: string;
  expanded: boolean;
  disabled?: boolean;
  optional?: boolean;
  compact?: boolean;
  compactOptions?: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onAdd?: () => void;
};

export function TransactionSelectionSection({
  title,
  placeholder,
  icon,
  options,
  selectedId,
  expanded,
  disabled = false,
  optional = false,
  compact = false,
  compactOptions = compact,
  onToggle,
  onSelect,
  onAdd,
}: TransactionSelectionSectionProps) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const selected = options.find((option) => option.id === selectedId);

  return (
    <Animated.View
      layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
      className={`border-b border-border ${compact ? "pb-3" : "pb-5"}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? t("transactions.selection.collapse", { title })
            : t("transactions.selection.expand", { title })
        }
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={onToggle}
        className={`${compact ? "min-h-14 gap-3 py-1" : "min-h-16 gap-4 py-2"} flex-row items-center`}
        style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
      >
        <View
          className={`${compact ? "size-8" : "size-10"} items-center justify-center`}
        >
          <FilledIcon
            name={icon}
            size={compact ? 23 : 28}
            tone={expanded ? "accent" : "foreground"}
          />
        </View>
        <View className="flex-1 gap-0.5">
          <Text
            className={`font-manrope-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}
          >
            {title}
            {optional
              ? t("transactions.selection.optional", { title: "" })
              : ""}
          </Text>
          <Text
            numberOfLines={1}
            className={`font-sans ${compact ? "text-xs" : "text-sm"} ${selected ? "text-accent" : "text-muted"}`}
          >
            {selected?.name ?? placeholder}
          </Text>
        </View>
        <FilledIcon
          name="chevron-right"
          size={compact ? 21 : 24}
          tone={expanded ? "accent" : "foreground"}
          style={{ transform: [{ rotate: expanded ? "-90deg" : "90deg" }] }}
        />
      </Pressable>

      {expanded && (
        <Animated.View
          entering={FadeInDown.duration(220)
            .withInitialValues({ opacity: 0, transform: [{ translateY: -8 }] })
            .reduceMotion(ReduceMotion.System)}
          exiting={FadeOutUp.duration(160).reduceMotion(ReduceMotion.System)}
          layout={LinearTransition.duration(220).reduceMotion(
            ReduceMotion.System,
          )}
          className={`flex-row flex-wrap ${compactOptions ? "gap-1.5 pt-1" : "gap-2 pt-2"}`}
        >
          {options.map((option) => {
            const isSelected = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityLabel={
                  isSelected
                    ? t("transactions.selection.deselect", {
                        name: option.name,
                      })
                    : option.name
                }
                accessibilityHint={
                  isSelected
                    ? t("transactions.selection.removeSelection")
                    : option.description
                }
                accessibilityState={{ checked: isSelected, disabled }}
                disabled={disabled}
                onPress={() => onSelect(isSelected ? "" : option.id)}
                className={`${compactOptions ? "min-h-9 gap-1.5 px-2.5" : "min-h-11 gap-2 px-3"} max-w-full flex-row items-center rounded-full border`}
                style={({ pressed }) => [
                  {
                    backgroundColor: isSelected
                      ? colorWithAlpha(theme.accent, 0.14)
                      : theme.surface,
                    borderColor: isSelected ? theme.accent : theme.border,
                    opacity: pressed ? 0.68 : 1,
                  },
                ]}
              >
                <RecordIcon
                  color={option.color}
                  name={option.icon}
                  pathData={option.iconPath}
                  size={compactOptions ? 17 : 20}
                />
                <Text
                  numberOfLines={1}
                  className={`max-w-48 font-manrope-medium text-sm ${
                    isSelected ? "text-accent" : "text-foreground"
                  }`}
                >
                  {option.name}
                </Text>
              </Pressable>
            );
          })}

          {!options.length ? (
            <Text className="py-2 font-sans text-sm text-muted">
              {t("transactions.selection.empty", { title })}
            </Text>
          ) : null}

          {onAdd ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                "transactions.selection.addAccessibility",
                { title },
              )}
              disabled={disabled}
              onPress={onAdd}
              className={`${compactOptions ? "h-9 gap-1.5 px-2.5" : "h-11 gap-2 px-3"} flex-row items-center rounded-full border border-border bg-surface`}
              style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
            >
              <View
                className={`${compactOptions ? "size-5" : "size-6"} items-center justify-center rounded-full border border-accent`}
              >
                <FilledIcon
                  name="plus"
                  size={compactOptions ? 15 : 17}
                  tone="accent"
                />
              </View>
              <Text className="font-manrope-medium text-sm text-foreground">
                {t("transactions.selection.add")}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      )}
    </Animated.View>
  );
}
