import { useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import { financialMonth } from "@/data/model/financial-month";
import {
  selectConsumptionReport,
  selectPeriodReview,
} from "@/data/selectors/consumption-report-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionMonthSelector } from "@/features/home/components/transaction-month-selector";
import { Text } from "@/shared/ui/app-text";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { TabPage } from "@/shared/ui/tab-page";
import { TAB_HEADER_HEIGHT, TabHeader } from "@/shared/navigation/tab-header";
import { useTabAction } from "@/shared/navigation/tab-actions";

import { AccountBalancesSection } from "./components/account-balances-section";
import { CashFlowCard } from "./components/cash-flow-card";
import { DailyActivityCard } from "./components/daily-activity-card";
import { PeriodCompareRow } from "./components/period-compare-row";
import { PeriodReviewSheet } from "./components/period-review-sheet";
import { SpendingBreakdown } from "./components/spending-breakdown";

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
  const { document, ensurePeriodLoaded } = useLocalData();
  const [offset, setOffset] = useState(0);
  const [currency, setCurrency] = useState(activeProfile.currencyCode);
  const now = useCategoryClock(document);
  const { start: windowStart } = financialMonth(
    now,
    document._local.monthStartDay,
    offset - 5,
  );
  const { end: windowEnd } = financialMonth(
    now,
    document._local.monthStartDay,
    offset,
  );
  const windowStartTime = windowStart.getTime();
  const windowEndTime = windowEnd.getTime();
  useLayoutEffect(() => {
    void ensurePeriodLoaded?.(
      new Date(windowStartTime),
      new Date(windowEndTime),
    );
  }, [ensurePeriodLoaded, windowStartTime, windowEndTime]);
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
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  // Stays computed after the first open so the sheet keeps its content while
  // it animates closed.
  const [isReviewRequested, setIsReviewRequested] = useState(false);
  // The bottom-bar action and the in-page row open the same review.
  const openReview = () => {
    setIsReviewRequested(true);
    setIsReviewOpen(true);
  };
  useTabAction("reports", openReview);
  const review = useMemo(
    () =>
      isReviewRequested
        ? selectPeriodReview(
            document,
            activeProfile.currencyCode,
            now,
            offset,
            flow.currencyCode,
          )
        : null,
    // Unnamed categories are localized by the selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isReviewRequested,
      document,
      activeProfile.currencyCode,
      now,
      offset,
      flow.currencyCode,
      i18n.resolvedLanguage,
    ],
  );

  return (
    <>
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
              <GlassSegmentedControl
                accessibilityLabel={t("reports.overview.currencies")}
                fitLabels
                minHeight={44}
                options={report.flows.map((item) => ({
                  label: item.currencyCode,
                  value: item.currencyCode,
                }))}
                value={flow.currencyCode}
                onChange={setCurrency}
              />
              <Text className="px-1 font-sans text-[12px] leading-[17px] text-muted">
                {t("reports.overview.currencyNote")}
              </Text>
            </View>
          ) : null}
        </View>
        <SpendingBreakdown key={`pie:${periodKey}`} flow={flow} />
        <View className="gap-3">
          <CashFlowCard flow={flow} />
          <PeriodCompareRow onPress={openReview} />
        </View>
        <DailyActivityCard key={`daily:${periodKey}`} flow={flow} />
        <AccountBalancesSection holdings={report.holdings} />
      </TabPage>
      {review ? (
        <PeriodReviewSheet
          review={review}
          isOpen={isReviewOpen}
          onOpenChange={setIsReviewOpen}
        />
      ) : null}
    </>
  );
}
