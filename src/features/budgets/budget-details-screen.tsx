import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { useLocalData } from "@/data/local-data-provider";
import { BottomSafeAreaGradient } from "@/shared/ui/safe-area-gradients";
import { belongsToProfile, identity } from "@/data/model/category-record";
import { selectBudgets } from "@/data/selectors/document-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { formatCurrency } from "@/shared/lib/currency";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";
import { useRouter } from "expo-router";
import { BottomSheet, Button } from "heroui-native";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, I18nManager, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BudgetBadge,
  BudgetChart,
  BudgetHeader,
  BudgetPanel,
  BudgetProgress,
  BudgetSummary,
  BudgetToggle,
} from "./components/budget-ui";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";

export function BudgetDetailsScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { document, updateDocument } = useLocalData(),
    now = useCategoryClock();
  const router = useRouter(),
    insets = useSafeAreaInsets(),
    c = useAppThemeColors();
  const budget = useMemo(
    () => selectBudgets(document, now).find((b) => b.id === id),
    [document, now, id],
  );
  const [sheet, setSheet] = useState<"delete" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showOnHome, setShowOnHome] = useState(() => budget?.showOnHome ?? false);
  const deleteSheetInitialPositionFix = useBottomSheetInitialPositionFix(
    sheet === "delete",
  );
  const saving = useRef(false);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  async function mutate(action: "delete" | "home", value?: boolean) {
    if (saving.current) return;
    saving.current = true;
    const previousShowOnHome = showOnHome;
    if (action === "delete") setBusy(true);
    else setShowOnHome(value === true);
    setError("");
    try {
      await updateDocument((current) => {
        const record = current.budgets.find((b) => identity(b) === id);
        if (!record || !belongsToProfile(current, record))
          throw new Error(t("budgets.details.unavailableError"));
        return {
          ...current,
          budgets:
            action === "delete"
              ? current.budgets.filter((b) => identity(b) !== id)
              : current.budgets.map((b) =>
                  identity(b) === id
                    ? {
                        ...b,
                        showOnHome: value === true,
                        updatedAt: new Date().toISOString(),
                      }
                    : b,
                ),
        };
      });
      if (action === "delete") {
        setSheet(null);
        router.replace("/budgets");
      }
    } catch (reason) {
      if (action === "home") setShowOnHome(previousShowOnHome);
      setError(
        reason instanceof Error
          ? reason.message
          : t("budgets.details.updateError"),
      );
    } finally {
      saving.current = false;
      if (action === "delete") setBusy(false);
    }
  }
  if (!budget)
    return (
      <EdgeToEdgeLayout>
        <EdgeToEdgeScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24 }}
        >
          <BudgetHeader title={t("budgets.details.title")} />
          <Text className="p-5 text-muted">
            {t("budgets.details.unavailableError")}
          </Text>
        </EdgeToEdgeScrollView>
      </EdgeToEdgeLayout>
    );
  const b = budget;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Animated.FlatList
        data={b.transactions}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 100 + insets.bottom,
          gap: 12,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View className="gap-3 pb-3 pt-3">
            <CollapsingHeaderSpacer />
            <BudgetSummary budget={b} />
            <BudgetPanel>
              <BudgetToggle
                title={t("budgets.details.showBudget")}
                description={t("budgets.details.showBudgetHelp")}
                value={showOnHome}
                disabled={busy}
                onChange={(v) => mutate("home", v)}
              />
            </BudgetPanel>
            {!!error && (
              <Text accessibilityRole="alert" className="px-3 text-danger">
                {error}
              </Text>
            )}
            <BudgetChart budget={b} />
            <BudgetPanel>
              <Text
                className="font-manrope-semibold text-lg"
                style={{ color: b.color }}
              >
                {t("budgets.details.categoryBreakdown")}
              </Text>
              {b.breakdown.map((cat) => (
                <View key={cat.id} className="flex-row items-center gap-3 py-2">
                  <BudgetBadge budget={cat} />
                  <View className="flex-1 gap-3">
                    <View className="flex-row justify-between gap-2">
                      <Text className="flex-1 font-manrope-medium text-foreground">
                        {cat.name}
                      </Text>
                      <Text className="text-sm text-muted">
                        {b.tracked
                          ? Math.round((cat.amount / b.tracked) * 100)
                          : 0}
                        %{" "}
                        <Text className="font-manrope-semibold text-foreground">
                          {formatCurrency(cat.amount, b.currencyCode)}
                        </Text>
                      </Text>
                    </View>
                    <BudgetProgress
                      percent={b.tracked ? (cat.amount / b.tracked) * 100 : 0}
                      color={cat.color}
                    />
                  </View>
                </View>
              ))}
              {!b.breakdown.length && (
                <Text className="text-muted">
                  {t("budgets.details.noCategoryActivity")}
                </Text>
              )}
            </BudgetPanel>
            <BudgetPanel>
              <Text className="font-manrope-semibold text-foreground">
                {b.range.start.toLocaleDateString(i18n.resolvedLanguage)} –{" "}
                {new Date(b.range.end.getTime() - 1).toLocaleDateString(
                  i18n.resolvedLanguage,
                )}
              </Text>
              <Text className="text-sm leading-6 text-muted">
                {t("budgets.details.matchingTransactions", {
                  count: b.transactions.length,
                  currency: b.currencyCode,
                })}
              </Text>
              {b.excludedCurrencyCount > 0 && (
                <Text className="text-sm text-muted">
                  {t("budgets.details.excludedCurrency", {
                    count: b.excludedCurrencyCount,
                  })}
                </Text>
              )}
              {b.notes.length > 0 && (
                <Text className="text-base leading-6 text-foreground">
                  {b.notes}
                </Text>
              )}
            </BudgetPanel>
            <Text className="px-2 pt-4 font-manrope-bold text-xl text-foreground">
              {t("budgets.details.transactions")}
            </Text>
          </View>
        }
        renderItem={({ item: t }) => (
          <View className="flex-row items-center gap-3 rounded-2xl bg-surface p-4">
            <View className="flex-1">
              <Text className="font-manrope-semibold text-base text-foreground">
                {t.name}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {t.categoryName} · {t.accountName}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {new Date(t.timestamp).toLocaleDateString(
                  i18n.resolvedLanguage,
                )}
              </Text>
            </View>
            <Text className="font-manrope-semibold text-foreground">
              {formatCurrency(t.amount, b.currencyCode)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text className="px-3 py-6 text-muted">
            {t("budgets.details.noTransactions")}
          </Text>
        }
      />
      <CollapsingHeader
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <BudgetHeader
          title={t("budgets.details.title")}
          disabled={busy}
          horizontalPadding={0}
        >
          <Button
            isDisabled={busy}
            variant="ghost"
            isIconOnly
            accessibilityLabel={t("budgets.details.addTransaction")}
            onPress={() =>
              router.push({
                pathname: "/transactions/create",
                params: { budgetId: b.id },
              })
            }
          >
            <FilledIcon name="plus" size={26} />
          </Button>
          <Button
            isDisabled={busy}
            variant="ghost"
            accessibilityLabel={t("budgets.details.deleteAccessibility")}
            onPress={() => setSheet("delete")}
          >
            <FilledIcon name="delete" size={25} tone="danger" />
          </Button>
        </BudgetHeader>
      </CollapsingHeader>
      <BottomSafeAreaGradient fadeHeight={124} />
      <View
        style={{
          position: "absolute",
          ...(I18nManager.isRTL ? { left: 20 } : { right: 20 }),
          bottom: Math.max(insets.bottom, 12),
        }}
      >
        <Button
          isDisabled={busy}
          className="h-14 rounded-2xl px-6"
          onPress={() =>
            router.push({ pathname: "/budgets/[id]/edit", params: { id } })
          }
        >
          <FilledIcon name="pencil" size={22} tone="accent-foreground" />
          <Button.Label>{t("budgets.details.edit")}</Button.Label>
        </Button>
      </View>
      <BottomSheet
        isOpen={sheet === "delete"}
        onOpenChange={(open) => {
          if (!open && !busy) setSheet(null);
        }}
      >
        <AppBottomSheetPortal
          isOpen={sheet === "delete"}
          unstable_accessibilityContainerViewIsModal
        >
          <BottomSheet.Overlay isCloseOnPress={!busy} />
          <BottomSheet.Content
            containerStyle={deleteSheetInitialPositionFix.containerStyle}
            onChange={deleteSheetInitialPositionFix.onChange}
            topInset={insets.top}
            bottomInset={insets.bottom}
            enablePanDownToClose={!busy}
            enableHandlePanningGesture={!busy}
            enableContentPanningGesture={!busy}
            contentContainerClassName="px-5 pb-0 pt-2"
            backgroundClassName="rounded-t-[28px] bg-surface"
            handleIndicatorClassName="w-10 bg-muted/40"
          >
            <View
              className="gap-5"
              style={{ paddingBottom: Math.max(insets.bottom, 16) + 12 }}
            >
              <View className="items-center gap-3">
                <View className="size-14 items-center justify-center rounded-full bg-danger/10">
                  <FilledIcon name="delete" size={30} tone="danger" />
                </View>
                <BottomSheet.Title className="text-center text-danger">
                  {t("budgets.details.deleteTitle")}
                </BottomSheet.Title>
              </View>
              <BottomSheet.Description className="font-sans text-base leading-6">
                {t("budgets.details.deleteDescription", { name: b.name })}
              </BottomSheet.Description>
              {!!error && (
                <Text accessibilityRole="alert" className="text-danger">
                  {error}
                </Text>
              )}
              <View className="flex-row gap-3">
                <Button
                  variant="tertiary"
                  className="flex-1"
                  isDisabled={busy}
                  onPress={() => setSheet(null)}
                >
                  <Button.Label>{t("budgets.common.cancel")}</Button.Label>
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  isDisabled={busy}
                  accessibilityState={{ busy }}
                  onPress={() => mutate("delete")}
                >
                  <Button.Label>
                    {busy
                      ? t("budgets.details.deleting")
                      : t("budgets.details.deleteBudget")}
                  </Button.Label>
                </Button>
              </View>
            </View>
          </BottomSheet.Content>
        </AppBottomSheetPortal>
      </BottomSheet>
    </View>
  );
}
