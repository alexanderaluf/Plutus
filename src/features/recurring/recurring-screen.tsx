import { BlurTargetView } from "expo-blur";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, AppState, View, type ViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import { dueOccurrenceCount } from "@/data/model/recurring-record";
import {
  selectAppPreferences,
  selectRecurrings,
  selectRecurringSummary,
  selectTransaction,
} from "@/data/selectors/document-selectors";
import type { Recurring } from "@/data/selectors/recurring-selectors";
import {
  BudgetHeader,
  BudgetOption,
  BudgetSheet,
} from "@/features/budgets/components/budget-ui";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { useAppLocalization } from "@/localization/localization-provider";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { CONTINUOUS } from "@/shared/ui/form-ui";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import { RecurringCalendar } from "./components/recurring-calendar";
import {
  RecurringDueCard,
  RecurringRow,
  RecurringSection,
  useScheduleSubtitle,
  useUpcomingLabel,
} from "./components/recurring-card";
import { RecurringOverview } from "./components/recurring-overview";
import { BusyButtonLabel, RecurringScrim } from "./components/recurring-ui";
import {
  groupUpcoming,
  relativeDay,
  type UpcomingGroup,
} from "./lib/recurring-list-helpers";
import {
  dueOccurrenceTotal,
  useRecurringActions,
} from "./use-recurring-actions";

type Tab = "active" | "calendar" | "archived";
type Sort = "date" | "name" | "amount";

export function useRecurringClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const scheduleMinuteTick = () => {
      if (disposed) return;
      const msUntilNextMinute = Math.max(1000, 60_000 - (Date.now() % 60_000));
      timer = setTimeout(() => {
        setNow(new Date());
        scheduleMinuteTick();
      }, msUntilNextMinute);
    };
    scheduleMinuteTick();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      listener.remove();
    };
  }, []);
  return now;
}

function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: FilledIconName;
  title: string;
  hint: string;
  action?: { label: string; onPress: () => void };
}) {
  const c = useAppThemeColors();
  return (
    <View className="items-center gap-3 px-6 py-14">
      <View
        className="size-20 items-center justify-center rounded-[26px]"
        style={{ ...CONTINUOUS, backgroundColor: colorWithAlpha(c.accent, 0.12) }}
      >
        <FilledIcon name={icon} size={40} tone="accent" />
      </View>
      <Text className="mt-2 text-center font-manrope-bold text-xl text-foreground">
        {title}
      </Text>
      <Text className="text-center text-[15px] leading-6 text-muted">
        {hint}
      </Text>
      {action && (
        <Button className="mt-2" onPress={action.onPress}>
          <Button.Label>{action.label}</Button.Label>
        </Button>
      )}
    </View>
  );
}

export function RecurringScreen() {
  const {
      document,
      recurringError,
      recurringBackgroundAvailable,
      reconcileRecurringPayments,
    } = useLocalData(),
    { activeProfile } = useProfiles(),
    { isRTL } = useAppLocalization(),
    c = useAppThemeColors(),
    insets = useSafeAreaInsets(),
    router = useRouter(),
    { t } = useTranslation();
  const target = useRef<ViewInstance | null>(null),
    now = useRecurringClock(),
    actions = useRecurringActions();
  const { weekStartDay } = selectAppPreferences(document);
  const upcomingLabel = useUpcomingLabel(),
    scheduleSubtitle = useScheduleSubtitle();
  const [tab, setTab] = useState<Tab>("active"),
    [sort, setSort] = useState<Sort>("date"),
    [sheet, setSheet] = useState<"sort" | "info" | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null),
    [retryError, setRetryError] = useState("");
  const items = useMemo(() => selectRecurrings(document, now), [document, now]);
  const summary = useMemo(
    () => selectRecurringSummary(items, now),
    [items, now],
  );
  const dueCount = useMemo(() => dueOccurrenceTotal(items, now), [items, now]);
  const sorted = (list: Recurring[]) =>
    [...list].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "amount"
          ? a.currencyCode.localeCompare(b.currencyCode) || b.amount - a.amount
          : (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity),
    );
  const active = sorted(items.filter((r) => !r.archived));
  const archived = sorted(items.filter((r) => r.archived));
  // Due schedules always lead; the rest follow either in time buckets (date
  // sort) or as one list in the chosen order.
  const sections = groupUpcoming(active, now);
  const attention = sections.find((s) => s.group === "attention")?.items ?? [];
  const rest =
    sort === "date"
      ? sections.filter((s) => s.group !== "attention")
      : [
          {
            group: null,
            items: active.filter((r) => !attention.includes(r)),
          },
        ].filter((s) => s.items.length);
  const groupTitle: Record<Exclude<UpcomingGroup, "attention">, string> = {
    week: t("recurring.nextWeek"),
    month: t("recurring.laterThisMonth"),
    later: t("recurring.later"),
  };
  const transaction = transactionId
    ? selectTransaction(document, transactionId)
    : null;
  const openRecurring = (id: string) =>
    router.push({ pathname: "/recurring/[id]", params: { id } });
  const error = actions.error || recurringError || retryError;
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  const bottom = Math.max(insets.bottom, 10);

  const upcomingRow = (item: Recurring) => {
    const soon = item.next ? relativeDay(item.next, now) : null;
    return (
      <RecurringRow
        key={item.id}
        badge={item}
        title={item.name}
        subtitle={scheduleSubtitle(item)}
        amount={item}
        caption={item.next ? upcomingLabel(item.next, now) : undefined}
        captionTone={soon && soon.count <= 1 ? "accent" : "muted"}
        onPress={() => openRecurring(item.id)}
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <BlurTargetView ref={target} style={{ flex: 1 }}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 170 + insets.bottom,
            gap: 20,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <CollapsingHeaderSpacer />
          {!!error && (
            <View
              className="flex-row items-center gap-3 rounded-[20px] p-3 ps-4"
              style={{
                ...CONTINUOUS,
                backgroundColor: colorWithAlpha(c.danger, 0.1),
              }}
            >
              <Text
                accessibilityRole="alert"
                className="flex-1 text-sm text-danger"
              >
                {error}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  setRetryError("");
                  void reconcileRecurringPayments().catch(() =>
                    setRetryError(t("recurring.error")),
                  );
                }}
              >
                <Button.Label>{t("recurring.retry")}</Button.Label>
              </Button>
            </View>
          )}

          {tab === "active" &&
            (active.length ? (
              <>
                <RecurringOverview
                  summary={summary}
                  fallbackCurrency={activeProfile.currencyCode}
                />
                {attention.length > 0 && (
                  <RecurringSection
                    title={t("recurring.needsAttention")}
                    count={attention.length}
                    bare
                    action={
                      dueCount > 1 ? (
                        <Button
                          size="sm"
                          variant="primary"
                          isDisabled={!!actions.busy}
                          accessibilityLabel={t(
                            "recurring.processAllAccessibility",
                          )}
                          accessibilityState={{ busy: actions.processingAll }}
                          onPress={() => actions.processAll(items)}
                        >
                          <BusyButtonLabel
                            label={t("recurring.processAll")}
                            busy={actions.processingAll}
                            spinnerColor={c.accentForeground}
                          />
                        </Button>
                      ) : undefined
                    }
                  >
                    {attention.map((item) => (
                      <RecurringDueCard
                        key={item.id}
                        item={item}
                        now={now}
                        dueCount={
                          item.due ? dueOccurrenceCount(item.record, now) : 0
                        }
                        busyAction={actions.actionFor(item)}
                        disabled={!!actions.busy}
                        onOpen={() => openRecurring(item.id)}
                        onProcess={() => actions.process(item)}
                        onSkip={() => actions.skip(item)}
                      />
                    ))}
                  </RecurringSection>
                )}
                {rest.map((section) => (
                  <RecurringSection
                    key={section.group ?? "all"}
                    title={
                      section.group
                        ? groupTitle[
                            section.group as Exclude<
                              UpcomingGroup,
                              "attention"
                            >
                          ]
                        : undefined
                    }
                    count={section.group ? section.items.length : undefined}
                  >
                    {section.items.map(upcomingRow)}
                  </RecurringSection>
                ))}
              </>
            ) : (
              <EmptyState
                icon="event-repeat"
                title={t("recurring.empty")}
                hint={t("recurring.emptyHint")}
                action={{
                  label: t("recurring.add"),
                  onPress: () => router.push("/recurring/create"),
                }}
              />
            ))}

          {tab === "calendar" && (
            <RecurringCalendar
              items={items}
              now={now}
              weekStartDay={weekStartDay}
              onOpenRecurring={openRecurring}
              onOpenTransaction={setTransactionId}
            />
          )}

          {tab === "archived" &&
            (archived.length ? (
              <RecurringSection>
                {archived.map((item) => (
                  <RecurringRow
                    key={item.id}
                    badge={item}
                    title={item.name}
                    subtitle={scheduleSubtitle(item)}
                    amount={item}
                    caption={item.next ? undefined : t("recurring.ended")}
                    muted
                    onPress={() => openRecurring(item.id)}
                  />
                ))}
              </RecurringSection>
            ) : (
              <EmptyState
                icon="history"
                title={t("recurring.emptyArchived")}
                hint={t("recurring.emptyArchivedHint")}
              />
            ))}
        </Animated.ScrollView>
      </BlurTargetView>

      <CollapsingHeader
        horizontalInset={12}
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <BudgetHeader title={t("recurring.title")} horizontalPadding={0}>
          {tab !== "calendar" && (
            <Button
              variant="ghost"
              isIconOnly
              accessibilityLabel={t("recurring.sort")}
              onPress={() => setSheet("sort")}
            >
              <FilledIcon name="sort" size={25} />
            </Button>
          )}
          <Button
            variant="ghost"
            isIconOnly
            accessibilityLabel={t("recurring.info")}
            onPress={() => setSheet("info")}
          >
            <FilledIcon name="help" size={25} />
          </Button>
        </BudgetHeader>
      </CollapsingHeader>

      <RecurringScrim />
      <View
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom,
          zIndex: 20,
        }}
      >
        <GlassSegmentedControl
          accessibilityLabel={t("recurring.title")}
          blurTarget={target}
          options={[
            {
              label: t("recurring.active"),
              value: "active" as const,
            },
            { label: t("recurring.calendar"), value: "calendar" as const },
            { label: t("recurring.archived"), value: "archived" as const },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <View
        style={{
          position: "absolute",
          ...(isRTL ? { left: 20 } : { right: 20 }),
          bottom: bottom + 76,
          zIndex: 20,
        }}
      >
        <Button
          isIconOnly
          accessibilityLabel={t("recurring.add")}
          className="size-16 rounded-full bg-accent"
          onPress={() => router.push("/recurring/create")}
        >
          <FilledIcon name="plus" size={32} tone="accent-foreground" />
        </Button>
      </View>

      {sheet === "sort" && (
        <BudgetSheet title={t("recurring.sort")} onClose={() => setSheet(null)}>
          {(
            [
              ["date", t("recurring.sortDate")],
              ["name", t("recurring.sortName")],
              ["amount", t("recurring.sortAmount")],
            ] as const
          ).map(([value, title]) => (
            <BudgetOption
              key={value}
              title={title}
              selected={sort === value}
              onPress={() => {
                setSort(value);
                setSheet(null);
              }}
            />
          ))}
        </BudgetSheet>
      )}
      {sheet === "info" && (
        <BudgetSheet title={t("recurring.info")} onClose={() => setSheet(null)}>
          <Text className="text-base leading-7 text-foreground">
            {t("recurring.infoBody")}
          </Text>
          <View
            className="flex-row gap-3 rounded-[20px] bg-surface p-4"
            style={CONTINUOUS}
          >
            <FilledIcon
              name={recurringBackgroundAvailable ? "shield-check" : "clock"}
              size={22}
              tone="accent"
            />
            <Text className="flex-1 text-[15px] leading-6 text-muted">
              {t(
                recurringBackgroundAvailable
                  ? "recurring.background"
                  : "recurring.foreground",
              )}
            </Text>
          </View>
        </BudgetSheet>
      )}
      {transaction && (
        <TransactionDetailSheet
          transaction={transaction}
          onDismiss={() => setTransactionId(null)}
        />
      )}
    </View>
  );
}
