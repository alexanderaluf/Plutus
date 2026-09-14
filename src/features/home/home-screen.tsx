import { BlurTargetView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Platform, Pressable, StyleSheet, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import {
  selectCategories,
  selectCategoryMonthlyTotals,
  selectHomeOverview,
  selectTrackedBudgets,
  selectTransactions,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { colorForeground } from "@/shared/icons/colors";
import { Text } from "@/shared/ui/app-text";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { FilledIcon } from "@/shared/ui/filled-icon";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";

import { useCategoryClock } from "@/features/categories/use-category-clock";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { BudgetCard } from "./components/budget-card";
import { CategoryList } from "./components/category-list";
import { OverviewCarousel } from "./components/overview-carousel";
import { TransactionList } from "./components/transaction-list";

type HomeSection = "transactions" | "categories" | "budgets";

const HEADER_HEIGHT = 64;
const SELECTOR_PINNED_TOP = 8;
const SELECTOR_SPACER_HEIGHT = 84;

export function HomeScreen() {
  const router = useRouter();
  const { i18n, t } = useTranslation();
  const { activeProfile } = useProfiles();
  const { document } = useLocalData();
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [section, setSection] = useState<HomeSection>("transactions");
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const [selectorTop, setSelectorTop] = useState<number | null>(null);
  const [isSelectorSticky, setIsSelectorSticky] = useState(false);
  const blurTargetRef = useRef<View | null>(null);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  const transactions = selectTransactions(document);
  const now = useCategoryClock(document);
  const categories = useMemo(() => selectCategories(document), [document]);
  const categoryTotals = useMemo(
    () => selectCategoryMonthlyTotals(document, now),
    [document, now],
  );
  const { persistedBudgets, overview } = useMemo(() => {
    return {
      persistedBudgets: selectTrackedBudgets(document, now),
      overview: selectHomeOverview(document, activeProfile.currencyCode, now),
    };
  }, [document, activeProfile.currencyCode, now]);

  const selectedTransaction = transactions.find(
    (transaction) => transaction.id === selectedTransactionId,
  );
  const selectorOptions = [
    {
      label: t("home.sectionSelector.transactions"),
      value: "transactions",
    },
    {
      label: t("home.sectionSelector.categories"),
      value: "categories",
    },
    { label: t("home.sectionSelector.budgets"), value: "budgets" },
  ] as const;

  useEffect(() => {
    if (selectorTop === null) {
      setIsSelectorSticky(false);
      return;
    }

    const stickyThreshold = selectorTop - SELECTOR_PINNED_TOP;
    const listener = scrollY.addListener(({ value }) => {
      const nextSticky = value >= stickyThreshold;
      setIsSelectorSticky((current) =>
        current === nextSticky ? current : nextSticky,
      );
    });

    return () => scrollY.removeListener(listener);
  }, [scrollY, selectorTop]);

  return (
    <>
      <View style={styles.fill}>
        <BlurTargetView ref={blurTargetRef} style={styles.fill}>
          <Animated.ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <CollapsingHeaderSpacer height={HEADER_HEIGHT} />
            <View style={styles.headerGap} />
            <OverviewCarousel
              key={activeProfile.id}
              overview={overview}
              now={now}
              isBalanceVisible={isBalanceVisible}
              onToggleBalance={() => setIsBalanceVisible((current) => !current)}
            />
            <View style={styles.sectionGap} />
            <View
              onLayout={({ nativeEvent: { layout } }) => {
                setSelectorTop((current) =>
                  current === layout.y ? current : layout.y,
                );
              }}
              pointerEvents={isSelectorSticky ? "none" : "auto"}
              accessibilityElementsHidden={isSelectorSticky}
              importantForAccessibility={
                isSelectorSticky ? "no-hide-descendants" : "auto"
              }
              style={[
                styles.selectorSpacer,
                isSelectorSticky && styles.hiddenSelectorSpacer,
              ]}
            >
              <GlassSegmentedControl
                accessibilityLabel={t(
                  "home.sectionSelector.accessibilityLabel",
                )}
                minHeight={Platform.OS === "android" ? 52 : 48}
                options={selectorOptions}
                value={section}
                onChange={setSection}
              />
            </View>
            {section === "transactions" ? (
              <View>
                <View className="mb-2">
                  <Text className="font-manrope-bold text-lg text-foreground">
                    {t("home.recentActivity.allTitle")}
                  </Text>
                  <Text className="mt-0.5 font-sans text-xs text-muted">
                    {t("home.recentActivity.description")}
                  </Text>
                </View>
                <TransactionList
                  transactions={transactions}
                  onPress={(transaction) =>
                    setSelectedTransactionId(transaction.id)
                  }
                />
              </View>
            ) : section === "categories" ? (
              <CategoryList
                categories={categories}
                totals={categoryTotals}
                fallbackCurrency={activeProfile.currencyCode}
                onPress={(category) =>
                  router.push({
                    pathname: "/categories/[id]",
                    params: { id: category.id },
                  })
                }
              />
            ) : (
              <BudgetCard budgets={persistedBudgets} showAll />
            )}
          </Animated.ScrollView>
        </BlurTargetView>
        <CollapsingHeader
          height={HEADER_HEIGHT}
          horizontalInset={20}
          headerHidden={headerHidden}
          scrollY={scrollY}
        >
          <View className="flex-row items-center justify-between pt-3">
            <View className="flex-1 pe-3">
              <Text className="font-manrope-medium text-xs uppercase tracking-widest text-muted">
                {now.toLocaleDateString(i18n.resolvedLanguage, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Text className="mt-1 font-manrope-bold text-2xl text-foreground">
                {t("home.greeting", { name: activeProfile.name.split(" ")[0] })}
              </Text>
            </View>

            <Pressable
              accessibilityLabel={t("home.openProfile")}
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push("/profile")}
              style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
            >
              <View
                className="size-10 items-center justify-center rounded-full"
                style={{ backgroundColor: activeProfile.color }}
              >
                <FilledIcon
                  color={colorForeground(activeProfile.color)}
                  name="account"
                  size={25}
                />
              </View>
            </Pressable>
          </View>
        </CollapsingHeader>
        {isSelectorSticky ? (
          <View style={[styles.selectorDock, { top: SELECTOR_PINNED_TOP }]}>
            <GlassSegmentedControl
              accessibilityLabel={t("home.sectionSelector.accessibilityLabel")}
              blurTarget={blurTargetRef}
              minHeight={Platform.OS === "android" ? 52 : 48}
              options={selectorOptions}
              value={section}
              onChange={setSection}
            />
          </View>
        ) : null}
      </View>
      {selectedTransaction ? (
        <TransactionDetailSheet
          transaction={selectedTransaction}
          onDismiss={() => setSelectedTransactionId(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 160 },
  headerGap: { height: 28 },
  sectionGap: { height: 28 },
  selectorSpacer: { height: SELECTOR_SPACER_HEIGHT },
  hiddenSelectorSpacer: { opacity: 0 },
  selectorDock: {
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 20,
  },
});
