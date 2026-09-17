import {
  TopSafeAreaGradient,
  BottomSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { BlurTargetView } from "expo-blur";
import Reanimated from "react-native-reanimated";
import {
  CategoryFormSections,
  categoryEntrance,
} from "./components/category-motion";
import { uuid } from "expo-modules-core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Input, Switch as HeroSwitch } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import {
  categoryFamily,
  saveCategory,
  type CategoryDraft,
  type CategoryType,
} from "@/data/model/category-record";
import { selectCategories } from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionSelectionSection } from "@/features/transactions/components/transaction-selection-section";
import { useAppLocalization } from "@/localization/localization-provider";
import { ICON_COLORS, colorForeground } from "@/shared/icons/colors";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { IconPicker } from "@/shared/ui/icon-picker";
import { RecordIcon } from "@/shared/ui/record-icon";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { CategoryTypeSelector } from "./components/category-ui";

export function CategoryEditorScreen({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const inputDirectionStyle = {
    direction,
    textAlign: direction === "rtl" ? ("right" as const) : ("left" as const),
    textAlignVertical: "center" as const,
    writingDirection: direction,
  };
  const params = useLocalSearchParams<{ parentId?: string; type?: string }>();
  const { document, updateDocument } = useLocalData();
  const { activeProfile } = useProfiles();
  const [profileId] = useState(activeProfile.id);
  const [initialSelection] = useState(document._local.selectedProfileId);
  const categories = useMemo(() => selectCategories(document), [document]);
  const existing = categories.find((category) => category.id === editId);
  const [draft, setDraft] = useState<CategoryDraft>(
    () =>
      existing ?? {
        name: "",
        description: "",
        type: (params.type === "1"
          ? 1
          : params.type === "2"
            ? 2
            : 0) as CategoryType,
        parentId: params.parentId ?? null,
        icon: "shopping",
        iconPath: null,
        color: "#ef5350",
        isDefault: false,
      },
  );
  const [showIcons, setShowIcons] = useState(false);
  const [showParents, setShowParents] = useState(!!params.parentId);
  const [palette, setPalette] = useState<"Primary" | "Accent" | "Custom">(
    "Primary",
  );
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const paletteLabels = {
    Primary: t("categories.form.palette.primary"),
    Accent: t("categories.form.palette.accent"),
    Custom: t("categories.form.palette.custom"),
  };
  const saving = useRef(false);
  const id = useRef(editId ?? uuid.v4());
  const blurTargetRef = useRef<View | null>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const topControlsTranslateY = scrollY.interpolate({
    inputRange: [0, 56],
    outputRange: [0, -56],
    extrapolate: "clamp",
  });
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 40],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const family = useMemo(
    () =>
      editId ? categoryFamily(document.categories, editId) : new Set<string>(),
    [document.categories, editId],
  );
  const parents = categories.filter(
    (category) => category.type === draft.type && !family.has(category.id),
  );
  const parent = categories.find((category) => category.id === draft.parentId);
  const color = /^#[a-f\d]{6}$/i.test(draft.color) ? draft.color : "#70d2eb";
  const title = editId
    ? t("categories.form.editTitle")
    : t("categories.form.title");

  useEffect(() => {
    let wasHidden = false;
    const listener = scrollY.addListener(({ value }) => {
      const hidden = value >= 40;
      if (hidden !== wasHidden) {
        wasHidden = hidden;
        setHeaderHidden(hidden);
      }
    });
    return () => scrollY.removeListener(listener);
  }, [scrollY]);

  function change<K extends keyof CategoryDraft>(
    key: K,
    value: CategoryDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function goBack() {
    if (isSaving) return;
    if (router.canGoBack()) router.back();
    else router.replace("/categories");
  }
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setIsSaving(true);
    Keyboard.dismiss();
    try {
      await updateDocument((current) => {
        if (current._local.selectedProfileId !== initialSelection)
          throw new Error(t("categories.form.activeProfileChanged"));
        return saveCategory(
          current,
          draft,
          id.current,
          profileId,
          new Date().toISOString(),
          !!editId,
        );
      });
      if (router.canGoBack()) router.back();
      else router.replace("/categories");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("categories.form.saveError"),
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }
  const swatches =
    palette === "Accent"
      ? ICON_COLORS.map((hex) => {
          const rgb = [1, 3, 5].map((start) =>
            Math.round(
              parseInt(hex.slice(start, start + 2), 16) * 0.65 + 255 * 0.35,
            )
              .toString(16)
              .padStart(2, "0"),
          );
          return `#${rgb.join("")}`;
        })
      : ICON_COLORS;
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <View style={styles.fill}>
          <BlurTargetView ref={blurTargetRef} style={styles.fill}>
            <Animated.ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingBottom: 104 + insets.bottom,
              }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver: true },
              )}
            >
              <View style={[styles.headerSpace, { height: 56 + insets.top }]} />
              <View style={styles.selectorSpace} />
              {editId && !existing ? (
                <Text className="px-5 text-danger">
                  {t("categories.form.missing")}
                </Text>
              ) : (
                <CategoryFormSections
                  collapsable={false}
                  pointerEvents={isSaving ? "none" : "auto"}
                  className="gap-5 px-5"
                >
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("categories.form.chooseIcon")}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowIcons(true);
                      }}
                      className="size-16 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: color }}
                    >
                      <RecordIcon
                        name={draft.icon}
                        pathData={draft.iconPath}
                        color={colorForeground(color)}
                        size={32}
                      />
                      <View
                        className="absolute -bottom-1 rounded-full border-2 border-background bg-surface p-1"
                        style={{ end: -4 }}
                      >
                        <FilledIcon name="pencil" size={14} />
                      </View>
                    </Pressable>
                    <Input
                      accessibilityLabel={t("categories.form.name")}
                      placeholder={t("categories.form.namePlaceholder")}
                      maxLength={100}
                      value={draft.name}
                      onChangeText={(value) => change("name", value)}
                      containerClassName="flex-1"
                      className="h-16 rounded-2xl bg-surface"
                      style={inputDirectionStyle}
                    />
                  </View>
                  <Input
                    accessibilityLabel={t("categories.form.description")}
                    placeholder={t("categories.form.descriptionPlaceholder")}
                    multiline
                    maxLength={500}
                    value={draft.description}
                    onChangeText={(value) => change("description", value)}
                    className="h-14 min-h-14 rounded-2xl bg-surface"
                    style={inputDirectionStyle}
                  />
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{
                      checked: draft.isDefault,
                      disabled: isSaving,
                    }}
                    accessibilityLabel={t("categories.form.defaultCategory")}
                    disabled={isSaving}
                    onPress={() => change("isDefault", !draft.isDefault)}
                    className="flex-row items-center gap-4 rounded-2xl py-2"
                    style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                  >
                    <View className="flex-1 gap-1">
                      <Text className="font-manrope-bold text-lg text-foreground">
                        {t("categories.form.defaultCategory")}
                      </Text>
                      <Text className="font-sans text-sm leading-5 text-muted">
                        {t("categories.form.defaultCategoryHelp")}
                      </Text>
                    </View>
                    <View
                      pointerEvents="none"
                      importantForAccessibility="no-hide-descendants"
                    >
                      <HeroSwitch
                        isSelected={draft.isDefault}
                        isDisabled={isSaving}
                        style={{ width: 60, height: 28 }}
                      >
                        <HeroSwitch.Thumb style={{ width: 36, height: 24 }} />
                      </HeroSwitch>
                    </View>
                  </Pressable>
                  <TransactionSelectionSection
                    title={t("categories.form.parentCategory")}
                    placeholder={t("categories.form.noParent")}
                    icon="filter"
                    options={parents.map((category) => ({
                      id: category.id,
                      name: category.name,
                      description: category.description,
                      icon: category.icon,
                      iconPath: category.iconPath,
                      color: category.color,
                    }))}
                    selectedId={parent?.id ?? ""}
                    expanded={showParents}
                    disabled={isSaving}
                    optional
                    compactOptions
                    onToggle={() => setShowParents((value) => !value)}
                    onSelect={(parentId) =>
                      change("parentId", parentId || null)
                    }
                  />
                  <Text className="mt-2 font-manrope-semibold text-lg text-foreground">
                    {t("categories.form.colors")}
                  </Text>
                  <View className="flex-row rounded-xl bg-surface p-1">
                    {(["Primary", "Accent", "Custom"] as const).map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: palette === value }}
                        onPress={() => setPalette(value)}
                        className={`min-h-11 flex-1 items-center justify-center rounded-lg ${
                          palette === value ? "bg-accent" : "bg-transparent"
                        }`}
                      >
                        <Text
                          className={
                            palette === value
                              ? "text-accent-foreground"
                              : "text-foreground"
                          }
                        >
                          {paletteLabels[value]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {palette === "Custom" ? (
                    <Input
                      accessibilityLabel={t("categories.form.customHex")}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder={t("categories.form.hexPlaceholder")}
                      maxLength={7}
                      value={draft.color}
                      onChangeText={(value) => change("color", value)}
                      style={inputDirectionStyle}
                    />
                  ) : (
                    <View className="flex-row flex-wrap gap-2">
                      {swatches.map((hex) => (
                        <Pressable
                          key={hex}
                          accessibilityRole="radio"
                          accessibilityLabel={t(
                            "categories.form.colorAccessibility",
                            { color: hex },
                          )}
                          accessibilityState={{
                            checked:
                              draft.color.toLowerCase() === hex.toLowerCase(),
                          }}
                          onPress={() => change("color", hex)}
                          style={{
                            backgroundColor: hex,
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {draft.color.toLowerCase() === hex.toLowerCase() && (
                            <FilledIcon
                              name="check"
                              color={colorForeground(hex)}
                              size={26}
                            />
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </CategoryFormSections>
              )}
            </Animated.ScrollView>
          </BlurTargetView>

          <TopSafeAreaGradient headerHidden={headerHidden} />

          <View
            collapsable={false}
            pointerEvents={headerHidden ? "none" : "box-none"}
            accessibilityElementsHidden={headerHidden}
            importantForAccessibility={
              headerHidden ? "no-hide-descendants" : "auto"
            }
            style={[styles.headerClip, { top: insets.top }]}
          >
            <Animated.View
              style={[
                styles.headerDock,
                {
                  opacity: headerOpacity,
                  transform: [{ translateY: topControlsTranslateY }],
                },
              ]}
            >
              <Button
                isIconOnly
                variant="ghost"
                accessibilityLabel={t("categories.common.back")}
                isDisabled={isSaving}
                onPress={goBack}
              >
                <FilledIcon name="arrow-left" size={24} />
              </Button>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="flex-1 font-manrope-bold text-xl text-foreground"
              >
                {title}
              </Text>
            </Animated.View>
          </View>

          <Animated.View
            collapsable={false}
            pointerEvents={isSaving ? "none" : "auto"}
            style={[
              styles.selectorDock,
              { top: 64 + insets.top },
              { transform: [{ translateY: topControlsTranslateY }] },
            ]}
          >
            <CategoryTypeSelector
              blurTarget={blurTargetRef}
              minHeight={Platform.OS === "android" ? 52 : 48}
              value={draft.type}
              onChange={(type) => {
                setDraft((current) => ({ ...current, type, parentId: null }));
                setError("");
              }}
            />
          </Animated.View>

          <BottomSafeAreaGradient />

          <Reanimated.View
            entering={categoryEntrance(220)}
            pointerEvents="box-none"
            style={[styles.actionDock, { bottom: Math.max(insets.bottom, 10) }]}
          >
            {!!error && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className="font-sans text-sm text-danger"
              >
                {error}
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isSaving
                  ? t("categories.form.saving")
                  : editId
                    ? t("categories.form.save")
                    : t("categories.form.add")
              }
              accessibilityState={{
                busy: isSaving,
                disabled: isSaving || (!!editId && !existing),
              }}
              disabled={isSaving || (!!editId && !existing)}
              onPress={save}
              android_ripple={{
                color: colorWithAlpha(theme.accentForeground, 0.16),
                borderless: false,
              }}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: theme.accent },
                (isSaving || (!!editId && !existing)) && styles.actionDisabled,
                Platform.OS === "ios" && pressed && styles.actionPressed,
              ]}
            >
              <FilledIcon name="check" size={24} tone="accent-foreground" />
              <Text
                numberOfLines={1}
                className="shrink font-manrope-bold text-base text-accent-foreground"
              >
                {isSaving
                  ? t("categories.form.saving")
                  : editId
                    ? t("categories.form.save")
                    : t("categories.form.add")}
              </Text>
            </Pressable>
          </Reanimated.View>
        </View>
      </KeyboardAvoidingView>
      {showIcons && (
        <IconPicker
          selected={{ name: draft.icon, pathData: draft.iconPath }}
          onClose={() => setShowIcons(false)}
          onSelect={(icon) => {
            setDraft((current) => ({
              ...current,
              icon: icon.name,
              iconPath: icon.pathData,
            }));
            setError("");
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerSpace: { height: 56 },
  selectorSpace: { height: 84 },
  headerClip: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: 56,
    overflow: "hidden",
    zIndex: 20,
  },
  headerDock: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectorDock: {
    position: "absolute",
    top: 64,
    left: 12,
    right: 12,
    zIndex: 20,
  },
  actionDock: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    gap: 6,
    zIndex: 20,
  },
  actionButton: {
    height: 58,
    borderRadius: 29,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  actionPressed: { opacity: 0.72 },
  actionDisabled: { opacity: 0.5 },
});
