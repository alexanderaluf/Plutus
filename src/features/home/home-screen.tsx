import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import {
  selectHomeOverview,
  selectTrackedBudgets,
  selectTransactions,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { colorForeground } from "@/shared/icons/colors";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { TabPage } from "@/shared/ui/tab-page";

import { useCategoryClock } from "@/features/categories/use-category-clock";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { BudgetCard } from "./components/budget-card";
import { OverviewCarousel } from "./components/overview-carousel";
import { TransactionList } from "./components/transaction-list";

export function HomeScreen() {
  const router = useRouter();
  const { i18n, t } = useTranslation();
  const { activeProfile } = useProfiles();
  const { document } = useLocalData();
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<
    string | null
  >(null);
  const transactions = selectTransactions(document);
  const now = useCategoryClock(document);
  const { persistedBudgets, overview } = useMemo(() => {
    return {
      persistedBudgets: selectTrackedBudgets(document, now),
      overview: selectHomeOverview(document, activeProfile.currencyCode, now),
    };
  }, [document, activeProfile.currencyCode, now]);

  const displayedTransactions = showAllTransactions
    ? transactions
    : transactions.slice(0, 3);
  const selectedTransaction = transactions.find(
    (transaction) => transaction.id === selectedTransactionId,
  );

  return (
    <>
      <TabPage
        contentBottomInset={160}
        headerHeight={64}
        header={
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
        }
      >
        <OverviewCarousel
          key={activeProfile.id}
          overview={overview}
          now={now}
          isBalanceVisible={isBalanceVisible}
          onToggleBalance={() => setIsBalanceVisible((current) => !current)}
        />

        <BudgetCard budgets={persistedBudgets} />

        <View>
          <View className="mb-2 flex-row items-center justify-between">
            <View>
              <Text className="font-manrope-bold text-lg text-foreground">
                {t("home.recentActivity.title")}
              </Text>
              <Text className="mt-0.5 font-sans text-xs text-muted">
                {t("home.recentActivity.description")}
              </Text>
            </View>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setShowAllTransactions((current) => !current)}
            >
              <Button.Label className="font-manrope-semibold text-accent">
                {showAllTransactions
                  ? t("home.recentActivity.showLess")
                  : t("home.recentActivity.seeAll")}
              </Button.Label>
              <FilledIcon name="chevron-right" size={18} tone="accent" />
            </Button>
          </View>

          <TransactionList
            transactions={displayedTransactions}
            onPress={(transaction) => setSelectedTransactionId(transaction.id)}
          />
        </View>
      </TabPage>
      {selectedTransaction ? (
        <TransactionDetailSheet
          transaction={selectedTransaction}
          onDismiss={() => setSelectedTransactionId(null)}
        />
      ) : null}
    </>
  );
}
