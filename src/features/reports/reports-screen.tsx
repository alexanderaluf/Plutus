import { Chip } from "heroui-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useLocalData } from "@/data/local-data-provider";
import { selectProfileReport } from "@/data/selectors/report-selectors";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { useProfiles } from "@/features/profile/profile-provider";
import { useAppDate } from "@/shared/lib/use-app-date";
import { PageHeader } from "@/shared/ui/page-header";
import { TabPage } from "@/shared/ui/tab-page";

import { CategoryDonutCard } from "./components/category-donut-card";
import { HealthScoreCard } from "./components/health-score-card";
import { InsightsCard } from "./components/insights-card";
import { ProfileStatsCard } from "./components/profile-stats-card";
import { SpendingPaceCard } from "./components/spending-pace-card";
import { TrendChartCard } from "./components/trend-chart-card";

export function ReportsScreen() {
  const { activeProfile } = useProfiles();
  const { t } = useTranslation();
  const { document } = useLocalData();
  const { formatDayMonth } = useAppDate();
  const now = useCategoryClock();
  const report = useMemo(
    () => selectProfileReport(document, activeProfile.currencyCode, now),
    [document, activeProfile.currencyCode, now],
  );

  return (
    <TabPage
      headerHeight={112}
      header={
        <PageHeader
          action={
            <Chip color="default" size="sm" variant="secondary">
              <Chip.Label className="font-manrope-bold">
                {`${formatDayMonth(report.period.start)} – ${formatDayMonth(
                  new Date(report.period.end.getTime() - 1),
                )}`}
              </Chip.Label>
            </Chip>
          }
          description={t("reports.description")}
          eyebrow={t("reports.eyebrow")}
          title={t("reports.title")}
        />
      }
    >
      <CategoryDonutCard report={report} />
      <HealthScoreCard report={report} />
      <InsightsCard report={report} />
      <ProfileStatsCard report={report} />
      <TrendChartCard report={report} />
      <SpendingPaceCard report={report} />
    </TabPage>
  );
}
