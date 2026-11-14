import { Switch as HeroSwitch } from "heroui-native";
import type { PropsWithChildren, ReactNode, Ref } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from "react-native";

import { useAppLocalization } from "@/localization/localization-provider";

import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";

// One visual system for the account form: bordered surface cards like the
// Home and Accounts tabs, quiet labels, and inputs one step darker than the card.
export const CONTINUOUS = { borderCurve: "continuous" as const };
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** The form's text field: one height, one radius, one type size everywhere. */
export function FieldInput({
  ref,
  style,
  ...props
}: TextInputProps & { ref?: Ref<TextInputInstance> }) {
  const theme = useAppThemeColors();
  const { direction } = useAppLocalization();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.muted}
      selectionColor={theme.accent}
      {...props}
      style={[
        styles.field,
        {
          backgroundColor: theme.surfaceSecondary,
          color: theme.foreground,
          direction,
          textAlign: direction === "rtl" ? "right" : "left",
          writingDirection: direction,
        },
        style,
      ]}
    />
  );
}

export function FormCard({
  children,
  title,
  icon,
}: PropsWithChildren<{ title?: string; icon?: FilledIconName }>) {
  const theme = useAppThemeColors();
  return (
    <View
      className="gap-4 rounded-[24px] border border-border bg-surface p-4"
      style={CONTINUOUS}
    >
      {title ? (
        <View className="flex-row items-center gap-2.5">
          {icon ? (
            <View
              className="size-8 items-center justify-center rounded-xl"
              style={{
                backgroundColor: colorWithAlpha(theme.accent, 0.14),
                ...CONTINUOUS,
              }}
            >
              <FilledIcon name={icon} size={17} tone="accent" />
            </View>
          ) : null}
          <Text
            accessibilityRole="header"
            className="min-w-0 flex-1 font-manrope-bold text-[17px] leading-[22px] text-foreground"
          >
            {title}
          </Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function FormLabel({ children }: PropsWithChildren) {
  return (
    <Text className="font-manrope-semibold text-[13px] leading-[18px] text-muted">
      {children}
    </Text>
  );
}

export function FormHelp({ children }: PropsWithChildren) {
  return (
    <Text className="font-sans text-[12px] leading-[17px] text-muted">
      {children}
    </Text>
  );
}

export function FormField({
  label,
  help,
  children,
}: PropsWithChildren<{ label: string; help?: ReactNode }>) {
  return (
    <View className="gap-2">
      <FormLabel>{label}</FormLabel>
      {children}
      {help ? <FormHelp>{help}</FormHelp> : null}
    </View>
  );
}

export function FormDivider() {
  const theme = useAppThemeColors();
  return (
    <View
      style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }}
    />
  );
}

/** A large, single-tap choice; selection is shown by fill, not by text. */
export function ChoicePill({
  selected,
  onPress,
  accessibilityLabel,
  children,
  minWidth = 48,
}: PropsWithChildren<{
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  minWidth?: number;
}>) {
  const theme = useAppThemeColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="h-12 flex-row items-center justify-center gap-2 rounded-2xl px-3"
      style={({ pressed }) => ({
        minWidth,
        backgroundColor: selected ? theme.accent : theme.surfaceSecondary,
        borderWidth: 1.5,
        borderColor: selected ? theme.accent : "transparent",
        opacity: pressed ? 0.72 : 1,
        ...CONTINUOUS,
      })}
    >
      {children}
    </Pressable>
  );
}

/** Two or three exclusive choices; the chosen one fills with the accent. */
export function FormTabs<Value extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: {
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
  accessibilityLabel?: string;
}) {
  const theme = useAppThemeColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row rounded-2xl p-1"
      style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className="min-h-11 flex-1 items-center justify-center rounded-xl px-2"
            style={({ pressed }) => ({
              backgroundColor: selected ? theme.accent : "transparent",
              opacity: pressed ? 0.72 : 1,
              ...CONTINUOUS,
            })}
          >
            <Text
              numberOfLines={1}
              className={`font-manrope-semibold text-[14px] ${
                selected ? "text-accent-foreground" : "text-foreground"
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({
  icon,
  tone = "accent",
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  icon: FilledIconName;
  tone?: "accent" | "danger";
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useAppThemeColors();
  const color = tone === "danger" ? theme.danger : theme.accent;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className="flex-row items-center gap-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
    >
      <View
        className="size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: colorWithAlpha(color, 0.14), ...CONTINUOUS }}
      >
        <FilledIcon name={icon} size={20} color={color} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-manrope-semibold text-[15px] leading-[20px] text-foreground">
          {title}
        </Text>
        <Text className="font-sans text-[12px] leading-[17px] text-muted">
          {description}
        </Text>
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="shrink-0"
      >
        {Platform.OS === "android" ? (
          <HeroSwitch
            isSelected={value}
            isDisabled={disabled}
            style={{ width: 60, height: 28 }}
          >
            <HeroSwitch.Thumb style={{ width: 36, height: 24 }} />
          </HeroSwitch>
        ) : (
          <Switch
            value={value}
            disabled={disabled}
            trackColor={{ false: theme.surfaceTertiary, true: theme.accent }}
            thumbColor={value ? theme.accentForeground : theme.muted}
          />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    borderRadius: 16,
    borderCurve: "continuous",
    fontFamily: "Huninn_400Regular",
    fontSize: 16,
    height: 56,
    paddingHorizontal: 16,
  },
});
