import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type {
  PeriodCategoryChange,
  PeriodComparison,
  PeriodReview,
} from "@/data/selectors/consumption-report-selectors";
import { useAppLocalization } from "@/localization/localization-provider";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { AppBottomSheetPortal } from "@/shared/ui/app-bottom-sheet-portal";
import {
  BottomSheet,
  BottomSheetScrollView,
} from "@/shared/ui/app-bottom-sheet";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";
import { useBottomSheetInitialPositionFix } from "@/shared/ui/use-bottom-sheet-initial-position-fix";

type Tone = "success" | "danger" | "muted";
type Change = { icon: FilledIconName; tone: Tone; label: string };

function lastDay(start: Date, days: number) {
  const date = new Date(start);
  date.setDate(date.getDate() + Math.max(0, days - 1));
  return date;
}

function dayCount(start: Date, end: Date) {
  return Math.max(
    1,
    Math.round(
      (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
        new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate(),
        ).getTime()) /
        86_400_000,
    ),
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View className="gap-0.5 pb-1 pt-5">
      <Text className="font-manrope-bold text-base text-accent">{title}</Text>
      {description ? (
        <Text className="font-sans text-xs text-muted">{description}</Text>
      ) : null}
    </View>
  );
}

function ChangePill({ change }: { change: Change }) {
  const theme = useAppThemeColors();
  const color =
    change.tone === "success"
      ? theme.success
      : change.tone === "danger"
        ? theme.danger
        : theme.muted;

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2.5 py-1"
      style={{ backgroundColor: colorWithAlpha(color, 0.14) }}
    >
      <FilledIcon color={color} name={change.icon} size={14} />
      <Text
        className="font-manrope-bold text-xs"
        style={{ color, writingDirection: "ltr" }}
      >
        {change.label}
      </Text>
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  detail,
  change,
  showBorder,
}: {
  icon: FilledIconName;
  label: string;
  value: string;
  detail: string;
  change: Change | null;
  showBorder: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-4 py-3 ${
        showBorder ? "border-b border-border" : ""
      }`}
    >
      <View className="size-10 items-center justify-center">
        <FilledIcon name={icon} size={24} tone="muted" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-sans text-sm text-muted">{label}</Text>
        <Text
          selectable
          className="font-manrope-semibold text-base text-foreground"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
        <Text className="font-sans text-xs text-muted">{detail}</Text>
      </View>
      {change ? <ChangePill change={change} /> : null}
    </View>
  );
}

function CategoryChangeRow({
  item,
  detail,
  current,
  change,
  accessibilityLabel,
  showBorder,
}: {
  item: PeriodCategoryChange;
  detail: string;
  current: string;
  change: Change;
  accessibilityLabel: string;
  showBorder: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className={`flex-row items-center py-3 ${
        showBorder ? "border-b border-border" : ""
      }`}
    >
      <View
        className="size-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: colorWithAlpha(item.color, 0.18) }}
      >
        <RecordIcon
          color={item.color}
          name={item.icon}
          pathData={item.iconPath}
          size={21}
        />
      </View>
      <View className="ms-3 min-w-0 flex-1 gap-0.5">
        <Text
          numberOfLines={1}
          className="font-manrope-semibold text-[14px] text-foreground"
        >
          {item.label}
        </Text>
        <Text numberOfLines={1} className="font-sans text-xs text-muted">
          {detail}
        </Text>
      </View>
      <View className="ms-2 items-end gap-1">
        <Text
          className="font-manrope-bold text-[14px] text-foreground"
          style={{ fontVariant: ["tabular-nums"], writingDirection: "ltr" }}
        >
          {current}
        </Text>
        <ChangePill change={change} />
      </View>
    </View>
  );
}

export function PeriodReviewSheet({
  review,
  isOpen,
  onOpenChange,
}: {
  review: PeriodReview;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { direction } = useAppLocalization();
  const theme = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const initialPositionFix = useBottomSheetInitialPositionFix(isOpen);
  const { formatDayMonth } = useAppDate();
  const { formatCurrency, amountsHidden } = useCurrencyFormat();
  const money = (value: number) => formatCurrency(value, review.currencyCode);
  const signedMoney = (value: number) =>
    `${value > 0 ? "+" : "−"}${money(Math.abs(value))}`;
  const percentFormat = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const range = (start: Date, days: number) =>
    `${formatDayMonth(start)} – ${formatDayMonth(lastDay(start, days))}`;
  const currentRange = range(
    review.period.start,
    review.isPartial ? review.elapsedDays : review.totalDays,
  );
  const previousRange = range(
    review.previousPeriod.start,
    dayCount(review.previousPeriod.start, review.previousPeriod.end),
  );

  function percentChange(
    value: PeriodComparison,
    higherIsBetter: boolean,
  ): Change | null {
    if (!review.hasPrevious) return null;
    const delta = value.current - value.previous;
    if (Math.abs(delta) < 0.005) return null;
    const tone: Tone = delta > 0 === higherIsBetter ? "success" : "danger";
    const icon: FilledIconName = delta > 0 ? "trending-up" : "trending-down";
    if (value.previous === 0)
      return { icon, tone, label: t("reports.review.new") };
    if (amountsHidden) return { icon, tone, label: "••" };
    const ratio = Math.abs(delta / value.previous);
    return {
      icon,
      tone,
      label: `${delta > 0 ? "+" : "−"}${percentFormat.format(ratio)}`,
    };
  }

  const previousDetail = (value: PeriodComparison) =>
    review.hasPrevious
      ? t("reports.review.previous", { amount: money(value.previous) })
      : t("reports.review.noPrevious");

  const summary = [
    {
      icon: "arrow-top-right" as const,
      label: t("reports.review.spent"),
      value: review.spent,
      higherIsBetter: false,
    },
    {
      icon: "arrow-bottom-left" as const,
      label: t("reports.review.income"),
      value: review.income,
      higherIsBetter: true,
    },
    {
      icon: "wallet" as const,
      label: t("reports.review.net"),
      value: review.net,
      higherIsBetter: true,
    },
  ];

  function pace(): { change: Change | null; text: string } | null {
    if (review.projectedSpend === null || review.previousTotalSpend <= 0)
      return null;
    const delta = review.projectedSpend - review.previousTotalSpend;
    const total = money(review.previousTotalSpend);
    if (Math.abs(delta) <= review.previousTotalSpend * 0.02)
      return { change: null, text: t("reports.review.paceSame", { total }) };
    const change: Change = {
      icon: delta > 0 ? "trending-up" : "trending-down",
      tone: delta > 0 ? "danger" : "success",
      label: signedMoney(delta),
    };
    return delta > 0
      ? {
          change,
          text: t("reports.review.paceAbove", { amount: money(delta), total }),
        }
      : {
          change,
          text: t("reports.review.paceBelow", {
            amount: money(-delta),
            total,
          }),
        };
  }
  const paceSummary = pace();
  const changes = review.hasPrevious ? review.categoryChanges : [];

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <AppBottomSheetPortal
        isOpen={isOpen}
        unstable_accessibilityContainerViewIsModal
      >
        <BottomSheet.Overlay />
        <BottomSheet.Content
          containerStyle={initialPositionFix.containerStyle}
          onChange={initialPositionFix.onChange}
          snapPoints={["82%"]}
          topInset={insets.top}
          enableDynamicSizing={false}
          enableOverDrag={false}
          contentContainerClassName="h-full px-0 pb-0 pt-1"
          contentContainerProps={{ style: { direction } }}
          backgroundClassName="rounded-t-[28px] bg-surface"
          handleIndicatorClassName="w-10 bg-muted/40"
        >
          <BottomSheetScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <View className="flex-row items-center gap-4 border-b border-border pb-5">
              <View
                className="size-16 items-center justify-center rounded-2xl"
                style={{ backgroundColor: colorWithAlpha(theme.accent, 0.18) }}
              >
                <FilledIcon color={theme.accent} name="query-stats" size={32} />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <BottomSheet.Title numberOfLines={1}>
                  {t("reports.review.title")}
                </BottomSheet.Title>
                <BottomSheet.Description numberOfLines={2}>
                  {t("reports.review.comparedTo", {
                    current: currentRange,
                    previous: previousRange,
                  })}
                </BottomSheet.Description>
              </View>
            </View>

            {!review.hasActivity ? (
              <View className="items-center gap-3 px-4 py-12">
                <FilledIcon name="query-stats" size={32} tone="muted" />
                <Text className="text-center font-sans text-sm text-muted">
                  {t("reports.review.empty")}
                </Text>
              </View>
            ) : (
              <>
                <SectionHeading title={t("reports.review.summary")} />
                {summary.map((item, index) => (
                  <SummaryRow
                    key={item.icon}
                    icon={item.icon}
                    label={item.label}
                    value={money(item.value.current)}
                    detail={previousDetail(item.value)}
                    change={percentChange(item.value, item.higherIsBetter)}
                    showBorder={index < summary.length - 1}
                  />
                ))}

                {review.projectedSpend !== null ? (
                  <>
                    <SectionHeading title={t("reports.review.paceTitle")} />
                    <SummaryRow
                      icon="clock"
                      label={t("reports.review.paceDescription")}
                      value={money(review.projectedSpend)}
                      detail={
                        paceSummary?.text ?? t("reports.review.noPrevious")
                      }
                      change={paceSummary?.change ?? null}
                      showBorder={false}
                    />
                  </>
                ) : null}

                {changes.length > 0 ? (
                  <>
                    <SectionHeading
                      title={t("reports.review.changesTitle")}
                      description={t("reports.review.changesDescription")}
                    />
                    {changes.map((item, index) => {
                      const before = t("reports.review.previous", {
                        amount: money(item.previous),
                      });
                      return (
                        <CategoryChangeRow
                          key={item.id}
                          item={item}
                          detail={
                            item.parentLabel
                              ? `${item.parentLabel} · ${before}`
                              : before
                          }
                          current={money(item.current)}
                          change={{
                            icon:
                              item.delta > 0 ? "trending-up" : "trending-down",
                            tone: item.delta > 0 ? "danger" : "success",
                            label: signedMoney(item.delta),
                          }}
                          accessibilityLabel={t(
                            "reports.review.changeAccessibility",
                            {
                              label: item.label,
                              current: money(item.current),
                              previous: money(item.previous),
                            },
                          )}
                          showBorder={index < changes.length - 1}
                        />
                      );
                    })}
                  </>
                ) : null}

                <Text className="pt-5 font-sans text-xs leading-5 text-muted">
                  {review.isPartial
                    ? t("reports.review.partialNote")
                    : t("reports.review.fullNote")}
                </Text>
              </>
            )}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </AppBottomSheetPortal>
    </BottomSheet>
  );
}
