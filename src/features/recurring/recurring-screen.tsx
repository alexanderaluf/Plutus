import { BlurTargetView } from "expo-blur";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Animated, AppState, Pressable, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import { localDateKey } from "@/data/model/recurring-record";
import {
  selectRecurrings,
  selectRecurringEvents,
  selectRecurringSummary,
  recurringTotals,
  selectTransactions,
} from "@/data/selectors/document-selectors";
import {
  BudgetHeader,
  BudgetOption,
  BudgetSheet,
} from "@/features/budgets/components/budget-ui";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { GlassSegmentedControl } from "@/shared/ui/glass-segmented-control";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import { RecurringCard } from "./components/recurring-card";
import {
  MoneyLines,
  RecurringBadge,
  RecurringScrim,
} from "./components/recurring-ui";
import { useRecurringActions } from "./use-recurring-actions";

export function useRecurringClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(new Date());
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  return now;
}
export function RecurringScreen() {
  const {
      document,
      recurringError,
      recurringBackgroundAvailable,
      reconcileRecurringPayments,
    } = useLocalData(),
    { activeProfile } = useProfiles(),
    c = useAppThemeColors(),
    insets = useSafeAreaInsets(),
    router = useRouter(),
    { t, i18n } = useTranslation();
  const target = useRef<View | null>(null),
    now = useRecurringClock(),
    actions = useRecurringActions();
  const [view, setView] = useState<"all" | "calendar">("all"),
    [status, setStatus] = useState<"active" | "due" | "archived">("active");
  const [compact, setCompact] = useState(false),
    [sortSheet, setSortSheet] = useState(false),
    [sort, setSort] = useState<"date" | "name" | "amount">("date");
  const [month, setMonth] = useState(
      () => new Date(now.getFullYear(), now.getMonth(), 1),
    ),
    [day, setDay] = useState(() => localDateKey(now));
  const [transactionId, setTransactionId] = useState<string | null>(null),
    [retryError, setRetryError] = useState("");
  const items = useMemo(() => selectRecurrings(document, now), [document, now]);
  const summary = useMemo(
    () => selectRecurringSummary(items, now),
    [items, now],
  );
  const visible = items
    .filter((r) =>
      status === "archived"
        ? r.archived
        : status === "due"
          ? r.due
          : !r.archived,
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "amount"
          ? a.currencyCode.localeCompare(b.currencyCode) || b.amount - a.amount
          : (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity),
    );
  const events = useMemo(
    () =>
      selectRecurringEvents(
        items,
        month,
        new Date(month.getFullYear(), month.getMonth() + 1, 1),
      ),
    [items, month],
  );
  const selectedEvents = events.filter((e) => localDateKey(e.date) === day);
  const transaction = transactionId
    ? selectTransactions(document).find((v) => v.id === transactionId)
    : null;
  const shift = (amount: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setDay(localDateKey(next));
  };
  function stat(
    label: string,
    values: { amount: number; currencyCode: string }[],
    color?: string,
    primary = false,
  ) {
    return (
      <View
        style={{
          flex: 1,
          borderRadius: 22,
          padding: 14,
          gap: 7,
          backgroundColor: primary
            ? c.accent
            : color
              ? colorWithAlpha(color, 0.17)
              : c.surface,
        }}
      >
        <Text
          className="font-manrope-semibold text-base"
          style={{
            color: primary ? c.accentForeground : (color ?? c.foreground),
          }}
        >
          {label}
        </Text>
        <MoneyLines
          values={values}
          emptyCurrency={activeProfile.currencyCode}
          color={primary ? c.accentForeground : color}
          large
        />
      </View>
    );
  }
  const error = actions.error || recurringError || retryError;
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <BlurTargetView ref={target} style={{ flex: 1 }}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 16,
            paddingBottom: 160 + insets.bottom,
            gap: 16,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <CollapsingHeaderSpacer />
          <View className="gap-1 px-2">
            <Text className="font-manrope-semibold text-lg text-accent">
              {t("recurring.monthly")}
            </Text>
            <MoneyLines
              values={summary.monthly}
              emptyCurrency={activeProfile.currencyCode}
              color={c.accent}
              large
            />
          </View>
          <View className="gap-2">
            <View className="flex-row gap-2">
              {stat(t("recurring.dueMonth"), summary.due, undefined, true)}
              {stat(t("recurring.yearly"), summary.yearly)}
            </View>
            <View className="flex-row gap-2">
              {stat(t("recurring.income"), summary.income, c.success)}
              {stat(t("recurring.expense"), summary.expense, c.danger)}
            </View>
          </View>
          <GlassSegmentedControl
            accessibilityLabel={t("recurring.title")}
            options={[
              { label: t("recurring.all"), value: "all" },
              { label: t("recurring.calendar"), value: "calendar" },
            ]}
            value={view}
            onChange={setView}
          />
          {!!error && (
            <View className="gap-2 rounded-2xl border border-danger p-3">
              <Text accessibilityRole="alert" className="text-sm text-danger">
                {error}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => {
                  void reconcileRecurringPayments().catch(() =>
                    setRetryError(t("recurring.error")),
                  );
                }}
              >
                <Button.Label>{t("recurring.retry")}</Button.Label>
              </Button>
            </View>
          )}
          {view === "all" ? (
            <>
              <View className="flex-row items-center gap-1 px-2">
                <Text className="flex-1 font-manrope-semibold text-lg text-accent">
                  {t("recurring.count", { count: visible.length })}
                </Text>
                <Button
                  isIconOnly
                  variant="ghost"
                  accessibilityLabel={t("recurring.layout")}
                  onPress={() => setCompact(!compact)}
                >
                  <FilledIcon name="copy" size={24} />
                </Button>
                <Button
                  isIconOnly
                  variant="ghost"
                  accessibilityLabel={t("recurring.sort")}
                  onPress={() => setSortSheet(true)}
                >
                  <FilledIcon name="filter" size={24} />
                </Button>
              </View>
              {!visible.length && (
                <View className="items-center gap-3 px-5 py-16">
                  <FilledIcon name="swap-horizontal" size={72} tone="muted" />
                  <Text className="text-center font-manrope-semibold text-xl text-foreground">
                    {t(
                      status === "due"
                        ? "recurring.emptyDue"
                        : status === "archived"
                          ? "recurring.emptyArchived"
                          : "recurring.empty",
                    )}
                  </Text>
                  <Text className="text-center text-muted">
                    {t(
                      status === "due"
                        ? "recurring.emptyDueHint"
                        : status === "archived"
                          ? "recurring.emptyArchivedHint"
                          : "recurring.emptyHint",
                    )}
                  </Text>
                </View>
              )}
              {visible.map((item) => (
                <RecurringCard
                  key={item.id}
                  item={item}
                  compact={compact}
                  busy={!!actions.busy}
                  onProcess={() => actions.process(item)}
                  onSkip={() => actions.skip(item)}
                />
              ))}
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between">
                <Button
                  isIconOnly
                  variant="ghost"
                  accessibilityLabel={t("recurring.previousMonth")}
                  onPress={() => shift(-1)}
                >
                  <FilledIcon
                    name="chevron-right"
                    style={{ transform: [{ rotate: "180deg" }] }}
                    tone="accent"
                    size={28}
                  />
                </Button>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("recurring.today")}
                  onPress={() => {
                    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                    setDay(localDateKey(now));
                  }}
                >
                  <Text className="font-manrope-bold text-xl text-foreground">
                    {month.toLocaleDateString(i18n.resolvedLanguage, {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </Pressable>
                <Button
                  isIconOnly
                  variant="ghost"
                  accessibilityLabel={t("recurring.nextMonth")}
                  onPress={() => shift(1)}
                >
                  <FilledIcon name="chevron-right" tone="accent" size={28} />
                </Button>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {Array.from({ length: 7 }, (_, i) => (
                  <View
                    key={i}
                    style={{ width: "14.2857%", paddingVertical: 12 }}
                  >
                    <Text className="text-center text-xs text-muted">
                      {new Date(2026, 8, 6 + i).toLocaleDateString(
                        i18n.resolvedLanguage,
                        { weekday: "short" },
                      )}
                    </Text>
                  </View>
                ))}
                {Array.from(
                  {
                    length:
                      month.getDay() +
                      new Date(
                        month.getFullYear(),
                        month.getMonth() + 1,
                        0,
                      ).getDate(),
                  },
                  (_, index) => {
                    const date = index - month.getDay() + 1;
                    if (date <= 0)
                      return <View key={index} style={{ width: "14.2857%" }} />;
                    const current = new Date(
                        month.getFullYear(),
                        month.getMonth(),
                        date,
                      ),
                      key = localDateKey(current),
                      entries = events.filter(
                        (e) =>
                          localDateKey(e.date) === key &&
                          e.status !== "skipped",
                      ),
                      selected = key === day;
                    return (
                      <Pressable
                        key={index}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${current.toLocaleDateString(i18n.resolvedLanguage, { dateStyle: "full" })}, ${t("recurring.count", { count: entries.length })}`}
                        onPress={() => setDay(key)}
                        style={{ width: "14.2857%", minHeight: 72, padding: 2 }}
                      >
                        <View
                          style={{
                            flex: 1,
                            borderRadius: 12,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? c.accent : "transparent",
                            backgroundColor: selected
                              ? colorWithAlpha(c.accent, 0.12)
                              : entries.length
                                ? c.surface
                                : "transparent",
                            alignItems: "center",
                            gap: 7,
                            paddingVertical: 10,
                          }}
                        >
                          <Text
                            className="font-manrope-semibold"
                            style={{
                              color: selected ? c.accent : c.foreground,
                            }}
                          >
                            {date}
                          </Text>
                          <View className="flex-row gap-0.5">
                            {entries.slice(0, 2).map((e, i) => (
                              <RecurringBadge
                                key={i}
                                small
                                item={e.recurring}
                              />
                            ))}
                            {entries.length > 2 && (
                              <Text className="text-xs text-accent">
                                +{entries.length - 2}
                              </Text>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  },
                )}
              </View>
              <Text className="font-manrope-semibold text-lg text-foreground">
                {new Date(`${day}T12:00:00`).toLocaleDateString(
                  i18n.resolvedLanguage,
                  { dateStyle: "full" },
                )}
              </Text>
              <View className="flex-row gap-2">
                {stat(
                  t("recurring.dailyIncome"),
                  recurringTotals(
                    selectedEvents.filter(
                      (e) => e.type === 1 && e.status !== "skipped",
                    ),
                  ),
                  c.success,
                )}
                {stat(
                  t("recurring.dailyExpense"),
                  recurringTotals(
                    selectedEvents.filter(
                      (e) => e.type === 0 && e.status !== "skipped",
                    ),
                  ),
                  c.danger,
                )}
              </View>
              {!selectedEvents.length && (
                <Text className="py-6 text-center text-muted">
                  {t("recurring.noDay")}
                </Text>
              )}
              {selectedEvents.map((event, index) => (
                <View key={`${event.recurring.id}:${index}`} className="gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      event.transactionId
                        ? setTransactionId(event.transactionId)
                        : router.push({
                            pathname: "/recurring/[id]",
                            params: { id: event.recurring.id },
                          })
                    }
                    className="flex-row items-center gap-3 rounded-2xl bg-surface p-4"
                  >
                    <RecurringBadge item={event.recurring} />
                    <View className="flex-1 gap-1">
                      <Text className="font-manrope-semibold text-foreground">
                        {event.recurring.name}
                      </Text>
                      <Text className="text-sm text-muted">
                        {event.date.toLocaleTimeString(i18n.resolvedLanguage, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {t(`recurring.${event.status}`)}
                      </Text>
                    </View>
                    <MoneyLines values={[event]} />
                  </Pressable>
                </View>
              ))}
            </>
          )}
        </Animated.ScrollView>
      </BlurTargetView>
      <CollapsingHeader
        horizontalInset={12}
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <BudgetHeader title={t("recurring.title")} horizontalPadding={0}>
          <Button
            variant="ghost"
            isIconOnly
            accessibilityLabel={t("recurring.info")}
            onPress={() =>
              Alert.alert(
                t("recurring.info"),
                `${t("recurring.infoBody")}\n\n${t(recurringBackgroundAvailable ? "recurring.background" : "recurring.foreground")}`,
              )
            }
          >
            <FilledIcon name="help" size={26} />
          </Button>
        </BudgetHeader>
      </CollapsingHeader>
      <RecurringScrim />
      {view === "all" && (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: Math.max(insets.bottom, 10),
            zIndex: 20,
          }}
        >
          <GlassSegmentedControl
            accessibilityLabel={t("recurring.title")}
            blurTarget={target}
            options={(["active", "due", "archived"] as const).map((value) => ({
              label: t(`recurring.${value}`),
              value,
            }))}
            value={status}
            onChange={setStatus}
          />
        </View>
      )}
      <View
        style={{
          position: "absolute",
          right: 20,
          bottom: Math.max(insets.bottom, 10) + (view === "all" ? 78 : 12),
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
      {sortSheet && (
        <BudgetSheet
          title={t("recurring.sort")}
          onClose={() => setSortSheet(false)}
        >
          {(["date", "name", "amount"] as const).map((value) => (
            <BudgetOption
              key={value}
              title={t(
                value === "date"
                  ? "recurring.sortDate"
                  : value === "name"
                    ? "recurring.sortName"
                    : "recurring.sortAmount",
              )}
              selected={sort === value}
              onPress={() => {
                setSort(value);
                setSortSheet(false);
              }}
            />
          ))}
        </BudgetSheet>
      )}
      {transaction && (
        <TransactionDetailSheet
          transaction={transaction}
          onDismiss={() => setTransactionId(null)}
        />
      )}
    </SafeAreaView>
  );
}
