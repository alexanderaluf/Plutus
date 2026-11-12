import { EdgeToEdgeLayout } from "@/shared/ui/edge-to-edge-layout";
import { useCollapsingHeader } from "@/shared/ui/collapsing-header";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { Button, Input } from "heroui-native";
import {
  useDeferredValue,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { AppModal } from "@/shared/ui/app-modal";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { Text } from "@/shared/ui/app-text";
import { useAppLocalization } from "@/localization/localization-provider";
import { ICON_GROUPS } from "@/shared/icons/icon-options";
import { MATERIAL_ROUNDED_FILLED_ICONS } from "@/shared/icons/material-rounded-filled-icons";
import { RecordIcon, type IconSelection } from "./record-icon";
import { BrandSvg } from "./brand-svg";
import { GlassSegmentedControl } from "./glass-segmented-control";
import { BRAND_ICON_GROUPS } from "@/shared/icons/brand-icons";
import {
  BRAND_ICON_PREFIX,
  brandIconName,
} from "@/shared/icons/brand-icon-registry";
import type { BrandIcon } from "@/shared/icons/brand-icon-types";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";

type PickerIcon = IconSelection & {
  label: string;
  searchText: string;
  /** Present for brand logos, which preview in their original colors. */
  brand?: BrandIcon;
};
type IconPack = "minimal" | "brands";

/** Logo ink for brand marks drawn with `currentColor` on the white tile. */
const BRAND_TILE_INK = "#111111";
const PACK_SELECTOR_HEIGHT = 44;
/** Initial title-row estimate; replaced by the measured height on layout. */
const HEADER_HEIGHT = 64;
type PickerSection = { title: string; data: PickerIcon[][] };

const materialIconsByName = new Map(
  MATERIAL_ROUNDED_FILLED_ICONS.map((icon) => [
    `material:${icon.name}`,
    icon,
  ]),
);

function rowsOfSix(icons: PickerIcon[]) {
  const rows: PickerIcon[][] = [];
  for (let index = 0; index < icons.length; index += 6) {
    rows.push(icons.slice(index, index + 6));
  }
  return rows;
}

function PickerHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-3 px-5 py-3">
      <Button
        isIconOnly
        variant="ghost"
        accessibilityLabel={t("iconPicker.close")}
        onPress={onClose}
      >
        <FilledIcon name="arrow-left" size={24} />
      </Button>
      <View className="flex-1">
        <Text
          accessibilityRole="header"
          className="font-manrope-bold text-xl text-foreground"
        >
          {title}
        </Text>
      </View>
    </View>
  );
}

export function PickerModal({
  title,
  onClose,
  collapsibleHeader = false,
  children,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  /** The content renders its own header that scrolls away (icon picker). */
  collapsibleHeader?: boolean;
}>) {
  return (
    <AppModal
      visible
      presentation="fullScreen"
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <EdgeToEdgeLayout
            header={
              collapsibleHeader ? undefined : (
                <PickerHeader title={title} onClose={onClose} />
              )
            }
            bottomFade={false}
          >
            {children}
          </EdgeToEdgeLayout>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppModal>
  );
}

export function IconPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected: IconSelection;
  onSelect: (icon: IconSelection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <PickerModal
      collapsibleHeader
      title={t("iconPicker.title")}
      onClose={onClose}
    >
      <IconPickerContent
        selected={selected}
        onSelect={onSelect}
        onClose={onClose}
      />
    </PickerModal>
  );
}

function IconPickerContent({
  selected,
  onSelect,
  onClose,
}: {
  selected: IconSelection;
  onSelect: (icon: IconSelection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const insets = useSafeAreaInsets();
  const colors = useAppThemeColors();
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(selected);
  const [pack, setPack] = useState<IconPack>(
    selected.name.startsWith(BRAND_ICON_PREFIX) ? "brands" : "minimal",
  );
  const deferredQuery = useDeferredValue(query);
  const brandSections = useMemo<PickerSection[]>(() => {
    const search = deferredQuery.trim().toLowerCase();
    return BRAND_ICON_GROUPS.map((group) => {
      const title = t(`iconPicker.brandGroups.${group.category}`);
      const icons: PickerIcon[] = group.icons
        .map((brand) => ({
          brand,
          label: brand.label,
          name: brandIconName(brand.slug),
          pathData: null,
          searchText:
            `${brand.label} ${brand.slug} ${group.category} ${title}`.toLowerCase(),
        }))
        .filter((icon) => !search || icon.searchText.includes(search));
      return { title, data: rowsOfSix(icons) };
    }).filter((section) => section.data.length > 0);
  }, [deferredQuery, t]);
  const minimalSections = useMemo<PickerSection[]>(() => {
    const search = deferredQuery.trim().toLowerCase();

    // One section per default category; only these curated icons are
    // offered. Searching matches the icon name and its section title.
    return ICON_GROUPS.map((group) => {
      const title = t(`iconPicker.groups.${group.key}`);
      const icons: PickerIcon[] = group.icons
        .flatMap((icon) => {
          const materialIcon = materialIconsByName.get(icon.name);
          if (icon.name.startsWith("material:") && !materialIcon) return [];
          return [
            {
              label: icon.label,
              name: icon.name,
              pathData: materialIcon?.pathData ?? null,
              searchText: [
                group.key,
                title,
                icon.label,
                materialIcon?.searchText ?? "",
              ]
                .join(" ")
                .toLowerCase(),
            },
          ];
        })
        .filter((icon) => !search || icon.searchText.includes(search));
      return { title, data: rowsOfSix(icons) };
    }).filter((section) => section.data.length > 0);
  }, [deferredQuery, t]);
  const sections = pack === "brands" ? brandSections : minimalSections;
  // Like the new-account screen: the title row slides under the status bar
  // while scrolling, leaving only the search field and pack selector docked.
  const { scrollY, headerHidden, onScroll } = useCollapsingHeader();
  const [headerHeight, setHeaderHeight] = useState(HEADER_HEIGHT);
  const { headerOpacity, dockTranslateY } = useMemo(
    () => ({
      headerOpacity: scrollY.interpolate({
        inputRange: [0, headerHeight * 0.7],
        outputRange: [1, 0],
        extrapolate: "clamp",
      }),
      dockTranslateY: scrollY.interpolate({
        inputRange: [0, headerHeight],
        outputRange: [0, -headerHeight],
        extrapolate: "clamp",
      }),
    }),
    [headerHeight, scrollY],
  );

  return (
    <>
      <View style={{ flex: 1 }}>
        <Animated.View
          collapsable={false}
          onLayout={({ nativeEvent }) =>
            setHeaderHeight(nativeEvent.layout.height)
          }
          pointerEvents={headerHidden ? "none" : "auto"}
          accessibilityElementsHidden={headerHidden}
          importantForAccessibility={
            headerHidden ? "no-hide-descendants" : "auto"
          }
          style={{
            position: "absolute",
            top: insets.top,
            left: insets.left,
            right: insets.right,
            zIndex: 21,
            opacity: headerOpacity,
            transform: [{ translateY: dockTranslateY }],
          }}
        >
          <PickerHeader title={t("iconPicker.title")} onClose={onClose} />
        </Animated.View>
        <Animated.View
          style={{
            position: "absolute",
            top: insets.top + headerHeight,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingBottom: 12,
            zIndex: 20,
            transform: [{ translateY: dockTranslateY }],
          }}
        >
          <Input
            accessibilityLabel={t("iconPicker.search")}
            placeholder={t("iconPicker.search")}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={{
              direction,
              textAlign: direction === "rtl" ? "right" : "left",
              writingDirection: direction,
            }}
          />
          <View className="mt-3">
            <GlassSegmentedControl<IconPack>
              accessibilityLabel={t("iconPicker.packs.label")}
              minHeight={PACK_SELECTOR_HEIGHT}
              onChange={(next) => {
                // The list remounts at the top, so bring the title back too.
                scrollY.setValue(0);
                setPack(next);
              }}
              options={[
                { label: t("iconPicker.packs.minimal"), value: "minimal" },
                { label: t("iconPicker.packs.brands"), value: "brands" },
              ]}
              value={pack}
            />
          </View>
        </Animated.View>
        <Animated.SectionList<PickerIcon[], PickerSection>
          sections={sections}
          key={pack}
          onScroll={onScroll}
          scrollEventThrottle={16}
          extraData={draft.name}
          initialNumToRender={10}
          keyExtractor={(row) => row.map((icon) => icon.name).join("|")}
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={12}
          removeClippedSubviews={Platform.OS === "android"}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          style={{ flex: 1 }}
          windowSize={7}
          contentContainerStyle={{
            paddingTop:
              insets.top + headerHeight + 68 + PACK_SELECTOR_HEIGHT + 12,
            paddingBottom: 104 + insets.bottom,
          }}
          renderSectionHeader={({ section }) => (
            <View className="bg-background px-5 pb-2 pt-5">
              <Text className="font-manrope-semibold text-base text-accent">
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View className="flex-row px-3 py-1.5">
              {row.map((icon) => (
                <View key={icon.name} style={styles.iconSlot}>
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityLabel={icon.label}
                    accessibilityState={{ checked: draft.name === icon.name }}
                    onPress={() =>
                      setDraft({ name: icon.name, pathData: icon.pathData })
                    }
                    className="size-14 items-center justify-center rounded-full border-2"
                    style={({ pressed }) => [
                      {
                        borderColor:
                          draft.name === icon.name
                            ? colors.accent
                            : colors.border,
                        // Brand logos keep their original colors, so they
                        // sit on a white tile in both light and dark themes.
                        backgroundColor: icon.brand
                          ? "#ffffff"
                          : draft.name === icon.name
                            ? colorWithAlpha(colors.accent, 0.14)
                            : colors.surface,
                      },
                      Platform.OS === "android" && styles.androidIconButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    {icon.brand ? (
                      <BrandSvg
                        color={BRAND_TILE_INK}
                        size={28}
                        tree={icon.brand.colored}
                      />
                    ) : (
                      <RecordIcon
                        name={icon.name}
                        pathData={icon.pathData}
                        color={
                          draft.name === icon.name
                            ? colors.accent
                            : colors.foreground
                        }
                        size={26}
                      />
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          ListEmptyComponent={
            <Text className="px-5 py-8 text-center text-muted">
              {t("iconPicker.empty")}
            </Text>
          }
        />
      </View>
      <BottomSafeAreaGradient fadeHeight={128} />
      <View
        pointerEvents="box-none"
        style={[
          styles.actionDock,
          {
            bottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Pressable
          accessibilityLabel={t("iconPicker.doneAccessibility")}
          accessibilityRole="button"
          onPress={() => {
            onSelect(draft);
            onClose();
          }}
          style={({ pressed }) => [
            styles.doneButton,
            {
              backgroundColor: colors.accent,
              borderColor: colorWithAlpha(colors.foreground, 0.18),
            },
            pressed && styles.pressed,
          ]}
        >
          <FilledIcon name="check" size={24} tone="accent-foreground" />
          <Text className="font-manrope-bold text-base text-accent-foreground">
            {t("iconPicker.done")}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: "center",
    width: "16.666667%",
  },
  actionDock: {
    left: 0,
    paddingHorizontal: 12,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  doneButton: {
    alignItems: "center",
    borderRadius: 29,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
  },
  androidIconButton: {
    alignItems: "center",
    borderRadius: 30,
    borderWidth: 1.5,
    aspectRatio: 1,
    height: undefined,
    justifyContent: "center",
    width: "92%",
    maxWidth: 60,
  },
  pressed: {
    opacity: 0.72,
  },
});
