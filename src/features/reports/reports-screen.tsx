import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import { selectConsumptionReport } from "@/data/selectors/consumption-report-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionMonthSelector } from "@/features/home/components/transaction-month-selector";
import { Text } from "@/shared/ui/app-text";
import { TabPage } from "@/shared/ui/tab-page";
import { TAB_HEADER_HEIGHT, TabHeader } from "@/shared/navigation/tab-header";

import { ExpensePieCard } from "./components/expense-pie-card";
import { CashFlowCard } from "./components/cash-flow-card";
import { DailyActivityCard } from "./components/daily-activity-card";
import { MoneyLocationCard } from "./components/money-location-card";

export function ReportsScreen() {
  const { activeProfile } = useProfiles();
  const { document } = useLocalData();
  return (
    <ProfileReports
      key={`${activeProfile.id}:${document._local.monthStartDay}`}
    />
  );
}

function ProfileReports() {
  const { activeProfile } = useProfiles();
  const { t, i18n } = useTranslation();
  const { document } = useLocalData();
  const [offset, setOffset] = useState(0);
  const [currency, setCurrency] = useState(activeProfile.currencyCode);
  const now = useCategoryClock(document);
  const report = useMemo(
    () =>
      selectConsumptionReport(
        document,
        activeProfile.currencyCode,
        now,
        offset,
      ),
    // Unnamed categories are localized by the selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, activeProfile.currencyCode, now, offset, i18n.resolvedLanguage],
  );
  const flow =
    report.flows.find((item) => item.currencyCode === currency) ??
    report.flows[0];
  const periodKey = `${report.period.key}:${flow.currencyCode}`;

  return (
    <TabPage
      animateLayout
      headerHeight={TAB_HEADER_HEIGHT}
      header={<TabHeader />}
    >
      <View className="gap-3">
        <TransactionMonthSelector
          start={report.period.start}
          end={report.period.end}
          isCurrent={offset === 0}
          dateFormat={document._local.dateFormat}
          onPrevious={() => setOffset((value) => value - 1)}
          onNext={() => setOffset((value) => Math.min(0, value + 1))}
        />
        {report.flows.length > 1 ? (
          <View className="gap-2">
            <Text className="font-sans text-xs text-muted">
              {t("reports.overview.currencies")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {report.flows.map((item) => (
                <Pressable
                  key={item.currencyCode}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: item.currencyCode === flow.currencyCode,
                  }}
                  onPress={() => setCurrency(item.currencyCode)}
                  className={`min-h-11 min-w-16 items-center justify-center rounded-full px-4 ${item.currencyCode === flow.currencyCode ? "bg-accent" : "bg-surface"}`}
                >
                  <Text
                    className={`font-manrope-bold text-sm ${item.currencyCode === flow.currencyCode ? "text-accent-foreground" : "text-foreground"}`}
                  >
                    {item.currencyCode}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
      <ExpensePieCard key={`pie:${periodKey}`} flow={flow} />
      <CashFlowCard flow={flow} />
      <DailyActivityCard key={`daily:${periodKey}`} flow={flow} />
      <MoneyLocationCard holdings={report.holdings} />
    </TabPage>
  );
}
