import { SearchField } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type SearchToolbarProps = {
  value: string;
  activeFilters: number;
  onChange: (value: string) => void;
  onOpenFilters: () => void;
};

export function SearchToolbar({
  value,
  activeFilters,
  onChange,
  onOpenFilters,
}: SearchToolbarProps) {
  const { t } = useTranslation();
  const theme = useAppThemeColors();
  const active = activeFilters > 0;

  return (
    <View className="flex-row items-center gap-2.5">
      <View className="flex-1">
        <SearchField value={value} onChange={onChange}>
          <SearchField.Group className="min-h-13 rounded-2xl border border-border bg-surface">
            <SearchField.SearchIcon>
              <FilledIcon name="magnify" size={21} tone="muted" />
            </SearchField.SearchIcon>
            <SearchField.Input
              accessibilityLabel={t("search.field.accessibility")}
              autoCapitalize="none"
              autoCorrect={false}
              className="text-left font-sans"
              placeholder={t("search.field.placeholder")}
              returnKeyType="search"
            />
            <SearchField.ClearButton
              accessibilityLabel={t("search.field.clear")}
            >
              <FilledIcon name="close" size={18} tone="muted" />
            </SearchField.ClearButton>
          </SearchField.Group>
        </SearchField>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          active
            ? t("search.openFiltersActive", { count: activeFilters })
            : t("search.openFilters")
        }
        onPress={onOpenFilters}
        className={`size-13 items-center justify-center rounded-2xl ${
          active ? "bg-accent" : "border border-border bg-surface"
        }`}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <FilledIcon
          color={active ? theme.accentForeground : theme.foreground}
          name="tune"
          size={22}
        />
        {active ? (
          <View
            className="absolute -end-1.5 -top-1.5 min-w-5 items-center justify-center rounded-full px-1"
            style={{
              height: 20,
              backgroundColor: theme.foreground,
              borderWidth: 2,
              borderColor: theme.background,
            }}
          >
            <Text
              className="font-manrope-bold text-[10px]"
              style={{ color: theme.background }}
            >
              {activeFilters}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
