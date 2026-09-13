import { Chip } from "heroui-native";
import { useTranslation } from "react-i18next";

import { useLocalData } from "@/data/local-data-provider";
import {
  selectDailySpending,
  selectMonthlySummary,
  selectSpendingCategories,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { PageHeader } from "@/shared/ui/page-header";
import { TabPage } from "@/shared/ui/tab-page";

import { CategoryBreakdown } from "./components/category-breakdown";
import { SpendingChartCard } from "./components/spending-chart-card";

export function ReportsScreen() {
  const { activeProfile } = useProfiles();
  const { i18n, t } = useTranslation();
  const { document } = useLocalData();
  const summary = selectMonthlySummary(document);
  const dailySpending = selectDailySpending(document);
  const spendingCategories = selectSpendingCategories(document);
  const dailyAverage = summary.spent / Math.max(new Date().getDate(), 1);

  return (
    <TabPage
      headerHeight={112}
      header={
        <PageHeader
          action={
            <Chip color="default" size="sm" variant="secondary">
              <Chip.Label className="font-manrope-bold">
                {new Date().toLocaleDateString(i18n.resolvedLanguage, {
                  month: "long",
                })}
              </Chip.Label>
            </Chip>
          }
          description={t("reports.description")}
          eyebrow={t("reports.eyebrow")}
          title={t("reports.title")}
        />
      }
    >
      <SpendingChartCard
        changePercent={0}
        dailyAverage={dailyAverage}
        dailySpending={dailySpending}
        totalSpent={summary.spent}
        currencyCode={activeProfile.currencyCode}
      />
      <CategoryBreakdown
        categories={spendingCategories}
        currencyCode={activeProfile.currencyCode}
      />
    </TabPage>
  );
}
