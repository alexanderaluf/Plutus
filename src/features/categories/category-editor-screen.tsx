import {
  TopSafeAreaGradient,
  BottomSafeAreaGradient,
} from "@/shared/ui/safe-area-gradients";
import { BlurTargetView } from "expo-blur";
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  CategoryFormSections,
  categoryEntrance,
} from "./components/category-motion";
import { uuid } from "expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInputInstance,
  type ViewInstance,
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
import { ICON_COLORS, colorForeground } from "@/shared/icons/colors";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import {
  CONTINUOUS,
  FieldInput,
  FormCard,
  FormLabel,
  SwitchRow,
} from "@/shared/ui/form-ui";
import { IconPicker } from "@/shared/ui/icon-picker";
import { RecordIcon } from "@/shared/ui/record-icon";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { CategoryTypeSelector } from "./components/category-ui";
import {
  createInitialCategoryDraft,
  defaultCategoryIcons,
  parentOptions,
  suggestCategoryColor,
} from "./lib/initial-category-draft";

type Palette = "Primary" | "Accent" | "Custom";

/** Accent swatches are the primary colours, lifted toward white. */
function accentSwatch(hex: string) {
  const rgb = [1, 3, 5].map((start) =>
    Math.round(parseInt(hex.slice(start, start + 2), 16) * 0.65 + 255 * 0.35)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${rgb.join("")}`;
}

export function CategoryEditorScreen({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppThemeColors();
  const params = useLocalSearchParams<{ parentId?: string; type?: string }>();
  const { document, updateDocument } = useLocalData();
  const { activeProfile } = useProfiles();
  const [profileId] = useState(activeProfile.id);
  const [initialSelection] = useState(document._local.selectedProfileId);
  const categories = useMemo(() => selectCategories(document), [document]);
  const existing = categories.find((category) => category.id === editId);
  const [draft, setDraft] = useState<CategoryDraft>(
    () =>
      existing ??
      createInitialCategoryDraft(
        categories,
        (params.type === "1" ? 1 : params.type === "2" ? 2 : 0) as CategoryType,
        params.parentId ?? null,
      ),
  );
  const [showIcons, setShowIcons] = useState(false);
  const [palette, setPalette] = useState<Palette>(() =>
    ICON_COLORS.includes(draft.color.toLowerCase())
      ? "Primary"
      : ICON_COLORS.map(accentSwatch).includes(draft.color.toLowerCase())
        ? "Accent"
        : editId
          ? "Custom"
          : "Primary",
  );
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  // Suggestions follow the type and parent until the person makes a choice.
  const iconChosen = useRef(!!editId);
  const colorChosen = useRef(!!editId);
  const descriptionRef = useRef<TextInputInstance>(null);
  const paletteLabels = {
    Primary: t("categories.form.palette.primary"),
    Accent: t("categories.form.palette.accent"),
    Custom: t("categories.form.palette.custom"),
  };
  const saving = useRef(false);
  const id = useRef(editId ?? uuid.v4());
  const blurTargetRef = useRef<ViewInstance | null>(null);
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
  // Only main categories can be parents; subcategories never nest further.
  const parents = parentOptions(categories, draft.type, family, {
    editingId: editId,
    keepId: existing?.parentId,
  });
  const color = /^#[a-f\d]{6}$/i.test(draft.color) ? draft.color : "#70d2eb";
  const title = editId
    ? t("categories.form.editTitle")
    : t("categories.form.title");
  const isMissing = !!editId && !existing;
  const isReady =
    !isMissing &&
    draft.name.trim().length > 0 &&
    draft.name.trim().length <= 100 &&
    /^#[a-f\d]{6}$/i.test(draft.color);

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
  function chooseColor(value: string) {
    colorChosen.current = true;
    change("color", value);
  }
  function chooseParent(parentId: string | null) {
    setDraft((current) => ({
      ...current,
      parentId,
      ...(colorChosen.current
        ? {}
        : { color: suggestCategoryColor(categories, current.type, parentId) }),
    }));
    setError("");
  }
  function changeType(type: CategoryType) {
    setDraft((current) => ({
      ...current,
      type,
      parentId: null,
      ...(iconChosen.current
        ? {}
        : { icon: defaultCategoryIcons[type], iconPath: null }),
      ...(colorChosen.current
        ? {}
        : { color: suggestCategoryColor(categories, type, null) }),
    }));
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
    palette === "Accent" ? ICON_COLORS.map(accentSwatch) : ICON_COLORS;

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
                paddingBottom: 120 + insets.bottom,
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
              {isMissing ? (
                <Text className="px-5 text-danger">
                  {t("categories.form.missing")}
                </Text>
              ) : (
                <CategoryFormSections
                  collapsable={false}
                  pointerEvents={isSaving ? "none" : "auto"}
                  className="gap-3 px-4"
                >
                  {/* Identity: the tile previews the category as it will look. */}
                  <FormCard>
                    <View className="flex-row items-center gap-3.5">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("categories.form.chooseIcon")}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowIcons(true);
                        }}
                        className="size-[72px] items-center justify-center rounded-[22px]"
                        style={({ pressed }) => ({
                          backgroundColor: color,
                          opacity: pressed ? 0.8 : 1,
                          ...CONTINUOUS,
                        })}
                      >
                        <RecordIcon
                          name={draft.icon}
                          pathData={draft.iconPath}
                          color={colorForeground(color)}
                          size={34}
                        />
                        <View
                          className="absolute -bottom-1 rounded-full border-2 bg-surface p-1"
                          style={{ end: -4, borderColor: theme.surface }}
                        >
                          <FilledIcon name="pencil" size={13} />
                        </View>
                      </Pressable>
                      <View className="min-w-0 flex-1 gap-2">
                        <FormLabel>{t("categories.form.name")}</FormLabel>
                        <FieldInput
                          accessibilityLabel={t("categories.form.name")}
                          placeholder={t("categories.form.namePlaceholder")}
                          maxLength={100}
                          returnKeyType="next"
                          submitBehavior="submit"
                          onSubmitEditing={() => descriptionRef.current?.focus()}
                          value={draft.name}
                          onChangeText={(value) => change("name", value)}
                          style={styles.nameInput}
                        />
                      </View>
                    </View>
                    <View className="gap-2">
                      <FormLabel>{t("categories.form.description")}</FormLabel>
                      <FieldInput
                        ref={descriptionRef}
                        accessibilityLabel={t("categories.form.description")}
                        placeholder={t("categories.form.descriptionPlaceholder")}
                        multiline
                        maxLength={500}
                        value={draft.description}
                        onChangeText={(value) => change("description", value)}
                        textAlignVertical="top"
                        style={styles.description}
                      />
                    </View>
                  </FormCard>

                  <FormCard title={t("categories.form.colors")}>
                    <PaletteTabs
                      value={palette}
                      labels={paletteLabels}
                      onChange={setPalette}
                    />
                    {palette === "Custom" ? (
                      <View className="flex-row items-center gap-3">
                        <View
                          className="size-14 rounded-2xl"
                          style={{
                            backgroundColor: color,
                            borderWidth: 1,
                            borderColor: colorWithAlpha(theme.foreground, 0.12),
                            ...CONTINUOUS,
                          }}
                        />
                        <FieldInput
                          accessibilityLabel={t("categories.form.customHex")}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          placeholder={t("categories.form.hexPlaceholder")}
                          maxLength={7}
                          value={draft.color}
                          onChangeText={chooseColor}
                          style={styles.hexInput}
                        />
                      </View>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.swatches}
                        style={styles.bleed}
                      >
                        {swatches.map((hex) => {
                          const selected =
                            draft.color.toLowerCase() === hex.toLowerCase();
                          return (
                            <Pressable
                              key={hex}
                              accessibilityRole="radio"
                              accessibilityLabel={t(
                                "categories.form.colorAccessibility",
                                { color: hex },
                              )}
                              accessibilityState={{ checked: selected }}
                              onPress={() => chooseColor(hex)}
                              style={[
                                styles.swatchRing,
                                {
                                  borderColor: selected
                                    ? theme.foreground
                                    : "transparent",
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.swatch,
                                  {
                                    backgroundColor: hex,
                                    borderColor: colorWithAlpha(
                                      theme.foreground,
                                      0.12,
                                    ),
                                  },
                                ]}
                              >
                                {selected && (
                                  <FilledIcon
                                    name="check"
                                    color={colorForeground(hex)}
                                    size={20}
                                  />
                                )}
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </FormCard>

                  <FormCard title={t("categories.form.parentCategory")}>
                    <View style={styles.parentWrap}>
                      <ParentPill
                        selected={!draft.parentId}
                        label={t("categories.form.noParent")}
                        onPress={() => chooseParent(null)}
                      >
                        <FilledIcon
                          name="tag"
                          size={15}
                          color={
                            draft.parentId
                              ? theme.muted
                              : theme.accentForeground
                          }
                        />
                      </ParentPill>
                      {parents.map((option) => {
                        const selected = draft.parentId === option.id;
                        return (
                          <ParentPill
                            key={option.id}
                            selected={selected}
                            color={option.color}
                            label={option.name}
                            onPress={() =>
                              chooseParent(selected ? null : option.id)
                            }
                          >
                            <RecordIcon
                              name={option.icon}
                              pathData={option.iconPath}
                              color={
                                selected
                                  ? colorForeground(option.color)
                                  : option.color
                              }
                              size={15}
                            />
                          </ParentPill>
                        );
                      })}
                    </View>
                  </FormCard>

                  <FormCard>
                    <SwitchRow
                      icon="pin"
                      title={t("categories.form.defaultCategory")}
                      description={t("categories.form.defaultCategoryHelp")}
                      value={draft.isDefault}
                      disabled={isSaving}
                      onChange={(value) => change("isDefault", value)}
                    />
                  </FormCard>
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
              onChange={changeType}
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
                className="px-2 text-center font-sans text-sm text-danger"
              >
                {error}
              </Text>
            )}
            <SaveEmphasis ready={isReady}>
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
                  disabled: isSaving || isMissing,
                }}
                disabled={isSaving || isMissing}
                onPress={save}
                android_ripple={{
                  color: colorWithAlpha(theme.accentForeground, 0.16),
                  borderless: false,
                }}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: theme.accent },
                  (isSaving || isMissing) && styles.actionDisabled,
                  Platform.OS === "ios" && pressed && styles.actionPressed,
                ]}
              >
                <FilledIcon
                  name={editId ? "check" : "plus"}
                  size={24}
                  tone="accent-foreground"
                />
                <Text
                  numberOfLines={1}
                  className="shrink font-manrope-bold text-[17px] text-accent-foreground"
                >
                  {isSaving
                    ? t("categories.form.saving")
                    : editId
                      ? t("categories.form.save")
                      : t("categories.form.add")}
                </Text>
              </Pressable>
            </SaveEmphasis>
          </Reanimated.View>
        </View>
      </KeyboardAvoidingView>
      {showIcons && (
        <IconPicker
          selected={{ name: draft.icon, pathData: draft.iconPath }}
          onClose={() => setShowIcons(false)}
          onSelect={(icon) => {
            iconChosen.current = true;
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

function PaletteTabs({
  value,
  labels,
  onChange,
}: {
  value: Palette;
  labels: Record<Palette, string>;
  onChange: (value: Palette) => void;
}) {
  const theme = useAppThemeColors();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-2xl p-1"
      style={{ backgroundColor: theme.surfaceSecondary, ...CONTINUOUS }}
    >
      {(["Primary", "Accent", "Custom"] as const).map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            className="min-h-11 flex-1 items-center justify-center rounded-xl"
            style={({ pressed }) => ({
              backgroundColor: selected ? theme.accent : "transparent",
              opacity: pressed ? 0.72 : 1,
              ...CONTINUOUS,
            })}
          >
            <Text
              className={`font-manrope-semibold text-[14px] ${
                selected ? "text-accent-foreground" : "text-foreground"
              }`}
            >
              {labels[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One-tap parent choice, filled with the parent's colour when chosen. */
function ParentPill({
  selected,
  color,
  label,
  onPress,
  children,
}: {
  selected: boolean;
  color?: string;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const theme = useAppThemeColors();
  const fill = selected ? (color ?? theme.accent) : theme.surfaceSecondary;
  const ink = selected
    ? color
      ? colorForeground(color)
      : theme.accentForeground
    : theme.foreground;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.parentPill,
        { backgroundColor: fill, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <View
        style={[
          styles.parentIcon,
          {
            backgroundColor: selected
              ? colorWithAlpha(ink, 0.16)
              : color
                ? colorWithAlpha(color, theme.isDark ? 0.28 : 0.18)
                : colorWithAlpha(theme.muted, 0.16),
          },
        ]}
      >
        {children}
      </View>
      <Text
        numberOfLines={1}
        style={[styles.parentLabel, { color: ink }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Dimmed until the category has a name, then fully lit: readiness is seen,
 * not read. It stays pressable so a tap explains what is missing.
 */
function SaveEmphasis({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const emphasis = useSharedValue(ready ? 1 : 0);
  useEffect(() => {
    emphasis.set(
      withTiming(ready ? 1 : 0, {
        duration: 220,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [emphasis, ready]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.5 + emphasis.get() * 0.5,
    transform: [{ scale: 0.98 + emphasis.get() * 0.02 }],
  }));
  return <Reanimated.View style={style}>{children}</Reanimated.View>;
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
  nameInput: { fontSize: 17 },
  description: {
    height: "auto",
    minHeight: 56,
    maxHeight: 140,
    paddingVertical: 16,
  },
  hexInput: { flex: 1, letterSpacing: 1 },
  bleed: { marginHorizontal: -16 },
  swatches: { gap: 6, paddingHorizontal: 12 },
  swatchRing: { borderRadius: 999, borderWidth: 2, padding: 2 },
  swatch: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  parentWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  parentPill: {
    minHeight: 44,
    maxWidth: "100%",
    paddingStart: 8,
    paddingEnd: 13,
    paddingVertical: 6,
    borderRadius: 22,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  parentIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  parentLabel: {
    fontFamily: "Huninn_400Regular",
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 1,
  },
});
