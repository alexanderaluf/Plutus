import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { BlurTargetView } from "expo-blur";
import { BottomSheet, Button } from "heroui-native";
import { Animated, I18nManager, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import { selectBudgets } from "@/data/selectors/document-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { formatCurrency } from "@/shared/lib/currency";
import { Text } from "@/shared/ui/app-text";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import {
  BudgetHeader,
  BudgetOption,
  BudgetPanel,
  BudgetRing,
  BudgetSheet,
  useBudgetLabels,
} from "./components/budget-ui";
import { BudgetOverviewCard } from "@/features/home/components/budget-card";

type BudgetSort = "newest" | "name" | "mostUsed";

function BudgetSortSheet({
  isOpen,
  value,
  onChange,
  onClose,
}: {
  isOpen: boolean;
  value: BudgetSort;
  onChange: (value: BudgetSort) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const options = [
    ["newest", t("budgets.list.sort.newest")],
    ["name", t("budgets.list.sort.name")],
    ["mostUsed", t("budgets.list.sort.mostUsed")],
  ] as const;

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["48%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          topInset={insets.top}
          bottomInset={insets.bottom}
          contentContainerClassName="h-full px-5 pb-0 pt-2"
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <View className="flex-1 gap-3">
            <View className="border-b border-border pb-4">
              <BottomSheet.Title>
                {t("budgets.list.sortTitle")}
              </BottomSheet.Title>
            </View>
            <View
              className="gap-2"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
            >
              {options.map(([option, title]) => (
                <BudgetOption
                  key={option}
                  title={title}
                  selected={value === option}
                  onPress={() => onChange(option)}
                />
              ))}
            </View>
          </View>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}

export function BudgetsScreen() {
  const { t, i18n } = useTranslation();
  const labels = useBudgetLabels();
  const { document } = useLocalData(),
    now = useCategoryClock(document);
  const router = useRouter(),
    insets = useSafeAreaInsets(),
    c = useAppThemeColors();
  const target = useRef<View | null>(null);
  const [type, setType] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<BudgetSort>("newest"),
    [sheet, setSheet] = useState<"info" | "sort" | null>(null);
  const all = useMemo(() => selectBudgets(document, now), [document, now]);
  const budgets = all
    .filter((b) => b.transactionType === type)
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "mostUsed"
          ? b.percent - a.percent
          : String(b.record.createdAt).localeCompare(
              String(a.record.createdAt),
            ),
    );
  const totals = [...new Set(budgets.map((b) => b.currencyCode))].map(
    (currency) => {
      const group = budgets.filter((b) => b.currencyCode === currency);
      return {
        currency,
        limit: group.reduce((s, b) => s + b.limit, 0),
        tracked: group.reduce((s, b) => s + b.tracked, 0),
      };
    },
  );
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <BlurTargetView ref={target} style={{ flex: 1 }}>
        <Animated.FlatList
          data={budgets}
          keyExtractor={(b) => b.id}
          extraData={expandedId}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 190 + insets.bottom,
            gap: 12,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <BudgetOverviewCard
              budget={item}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId(expandedId === item.id ? null : item.id)
              }
            />
          )}
          ListHeaderComponent={
            <View className="gap-5 pb-2 pt-4">
              <CollapsingHeaderSpacer />
              {totals.map((total) => (
                <View
                  key={total.currency}
                  className="flex-row items-center gap-4"
                >
                  <BudgetRing
                    percent={
                      total.limit ? (total.tracked / total.limit) * 100 : 0
                    }
                    color={c.accent}
                  />
                  <View className="flex-1 gap-2">
                    {[
                      [t("budgets.list.total"), total.limit],
                      [labels.tracked[type], total.tracked],
                      [
                        t("budgets.list.remaining"),
                        total.limit - total.tracked,
                      ],
                    ].map(([label, value]) => (
                      <View
                        key={String(label)}
                        className="rounded-2xl border border-border bg-surface px-3 py-2"
                      >
                        <Text className="text-xs text-muted">{label}</Text>
                        <Text className="font-manrope-bold text-base text-foreground">
                          {Number(value) < 0 ? "−" : ""}
                          {formatCurrency(Number(value), total.currency)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              <View className="flex-row items-center justify-between">
                <Text className="font-manrope-semibold text-lg text-accent">
                  {t("budgets.list.count", { count: budgets.length })}
                </Text>
                <View className="flex-row gap-1">
                  <Button
                    isIconOnly
                    variant="secondary"
                    accessibilityLabel={t("budgets.list.sortAccessibility")}
                    onPress={() => setSheet("sort")}
                  >
                    <FilledIcon name="filter" size={22} />
                  </Button>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <BudgetPanel>
              <Text className="font-manrope-bold text-xl text-foreground">
                {t("budgets.list.emptyTitle")}
              </Text>
              <Text className="text-base leading-6 text-muted">
                {t("budgets.list.emptyDescription", {
                  type: labels.types[type].toLocaleLowerCase(
                    i18n.resolvedLanguage,
                  ),
                })}
              </Text>
              <Button onPress={() => router.push("/budgets/create")}>
                {t("budgets.list.create")}
              </Button>
            </BudgetPanel>
          }
        />
      </BlurTargetView>
      <CollapsingHeader
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <BudgetHeader title={t("budgets.list.title")} horizontalPadding={0}>
          <Button
            isIconOnly
            variant="ghost"
            accessibilityLabel={t("budgets.list.about")}
            onPress={() => setSheet("info")}
          >
            <FilledIcon name="help" size={25} />
          </Button>
        </BudgetHeader>
      </CollapsingHeader>
      <BottomSafeAreaGradient fadeHeight={162} zIndex={0} />
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: Math.max(insets.bottom, 10),
        }}
      >
        <GlassSegmentedControl
          accessibilityLabel={t("budgets.list.transactionType")}
          blurTarget={target}
          value={type}
          onChange={setType}
          options={labels.types.map((label, value) => ({ label, value }))}
        />
      </View>
      <View
        style={{
          position: "absolute",
          ...(I18nManager.isRTL ? { left: 20 } : { right: 20 }),
          bottom: Math.max(insets.bottom, 10) + 76,
        }}
      >
        <Button
          isIconOnly
          accessibilityLabel={t("budgets.list.add")}
          className="size-16 rounded-full"
          onPress={() => router.push("/budgets/create")}
        >
          <FilledIcon name="plus" size={30} tone="accent-foreground" />
        </Button>
      </View>
      {sheet === "info" && (
        <BudgetSheet
          title={t("budgets.list.howItWorks")}
          onClose={() => setSheet(null)}
        >
          <Text className="text-base leading-7 text-foreground">
            {t("budgets.list.infoTracking")}
          </Text>
          <Text className="text-base leading-7 text-muted">
            {t("budgets.list.infoTotals")}
          </Text>
          <Text className="text-base leading-7 text-muted">
            {t("budgets.list.infoPeriods")}
          </Text>
        </BudgetSheet>
      )}
      <BudgetSortSheet
        isOpen={sheet === "sort"}
        value={sort}
        onChange={setSort}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}
