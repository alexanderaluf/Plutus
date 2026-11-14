import { AppAlert } from "@/shared/ui/app-alert";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import Reanimated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import { belongsToProfile, identity } from "@/data/model/category-record";
import { dueOccurrenceCount, occurrenceDate } from "@/data/model/recurring-record";
import {
  recurringTotals,
  selectRecurringRelations,
  selectRecurrings,
  selectRecurringSummary,
  selectTransactions,
} from "@/data/selectors/document-selectors";
import type { Recurring } from "@/data/selectors/recurring-selectors";
import { BudgetHeader } from "@/features/budgets/components/budget-ui";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { CONTINUOUS, FormCard, FormDivider, SwitchRow, TABULAR } from "@/shared/ui/form-ui";
import { i18n } from "@/localization/i18n";
import { RecurringAmount } from "./components/recurring-card";
import {
  BusyButtonLabel,
  RecurringBadge,
  RecurringScrim,
} from "./components/recurring-ui";
import { calendarDayDistance } from "./lib/recurring-list-helpers";
import { useRecurringActions } from "./use-recurring-actions";
import { useRecurringClock } from "./recurring-screen";

/** History rows shown before "Show all". */
const HISTORY_PREVIEW = 5;

type Status = "upcoming" | "due" | "archived" | "ended" | "unsupported";

function recurringStatus(item: Recurring): Status {
  if (item.record.archived === true) return "archived";
  if (!item.next) return item.archived ? "ended" : "unsupported";
  return item.due ? "due" : "upcoming";
}

/** Elapsed share of the gap between the previous and next payment. */
function OccurrenceProgress({
  fraction,
  trackColor,
  fillColor,
}: {
  fraction: number;
  trackColor: string;
  fillColor: string;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    // Grows from empty when the page opens, then follows clock updates.
    progress.set(
      withTiming(fraction, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [fraction, progress]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.get() * 100}%`,
  }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: trackColor }}
    >
      <Reanimated.View
        className="h-full rounded-full"
        style={[{ backgroundColor: fillColor }, fillStyle]}
      />
    </View>
  );
}

/** Tinted icon square shared by every row on this page. */
function RowIcon({ name, color }: { name: FilledIconName; color: string }) {
  return (
    <View
      className="size-10 shrink-0 items-center justify-center rounded-xl"
      style={{ ...CONTINUOUS, backgroundColor: colorWithAlpha(color, 0.14) }}
    >
      <FilledIcon name={name} size={20} color={color} />
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  multiline = false,
}: {
  icon: FilledIconName;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const c = useAppThemeColors();
  return (
    <View className="flex-row items-center gap-3.5">
      <RowIcon name={icon} color={c.accent} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[12px] leading-[17px] text-muted">{label}</Text>
        <Text
          numberOfLines={multiline ? undefined : 1}
          selectable={multiline}
          className="font-manrope-semibold text-[15px] leading-[20px] text-foreground"
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Rows separated by hairlines, inside a FormCard. */
function Rows({ children }: { children: ReactNode[] }) {
  const rows = children.filter(Boolean);
  return (
    <View className="gap-3.5">
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 && <FormDivider />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

function Hero({ item, now }: { item: Recurring; now: Date }) {
  const c = useAppThemeColors(),
    { t } = useTranslation();
  const { formatCurrency } = useCurrencyFormat();
  // Only a non-monthly schedule gains anything from a monthly estimate; for a
  // monthly one it would repeat the amount.
  const monthly =
    item.period !== "Monthly" && item.valid
      ? selectRecurringSummary([item], now).monthly[0]
      : null;
  const inactive = item.archived;
  return (
    <View className="items-center gap-2 px-4 pb-1">
      <RecurringBadge item={item} size={72} muted={inactive} />
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        className="mt-2 text-center font-manrope-bold text-[22px] leading-[28px] text-foreground"
      >
        {item.name}
      </Text>
      <RecurringAmount
        amount={item.amount}
        currencyCode={item.currencyCode}
        type={item.type}
        muted={inactive}
        size="xl"
      />
      <View className="flex-row flex-wrap items-center justify-center gap-x-1.5">
        <Text className="font-manrope-semibold text-[15px] text-muted">
          {t(`recurring.periods.${item.period}`, {
            defaultValue: String(item.period),
          })}
        </Text>
        {monthly && (
          <Text
            className="text-[15px] text-muted"
            style={{ ...TABULAR, color: c.muted }}
          >
            ·{" "}
            {t("recurring.approxMonthly", {
              amount: formatCurrency(monthly.amount, monthly.currencyCode),
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * What happens next, and the one decision the person may need to make. The
 * card's tone and buttons follow the schedule's state instead of showing
 * disabled controls.
 */
function StatusCard({
  item,
  now,
  busy,
  onRestore,
}: {
  item: Recurring;
  now: Date;
  busy: boolean;
  onRestore: () => void;
}) {
  const c = useAppThemeColors(),
    { t } = useTranslation();
  const { formatDate, formatDayMonth } = useAppDate();
  const actions = useRecurringActions();
  const status = recurringStatus(item);
  const busyAction = actions.actionFor(item);
  const disabled = busy || !!actions.busy;
  const time = (date: Date) =>
    date.toLocaleTimeString(i18n.resolvedLanguage, { timeStyle: "short" });

  if (status === "archived" || status === "ended" || status === "unsupported") {
    const copy = {
      archived: { icon: "history", title: t("recurring.archived") },
      ended: { icon: "check", title: t("recurring.ended") },
      unsupported: { icon: "pencil", title: t("recurring.unsupported") },
    }[status] as { icon: FilledIconName; title: string };
    return (
      <View
        className="gap-4 rounded-[24px] border border-border bg-surface p-4"
        style={CONTINUOUS}
      >
        <View className="flex-row items-center gap-3.5">
          <RowIcon name={copy.icon} color={c.muted} />
          <Text className="flex-1 font-manrope-semibold text-[15px] text-foreground">
            {copy.title}
          </Text>
        </View>
        {status === "archived" && (
          <Button variant="secondary" isDisabled={busy} onPress={onRestore}>
            <FilledIcon name="backup" size={20} tone="accent" />
            <Button.Label>{t("recurring.restore")}</Button.Label>
          </Button>
        )}
        {!!actions.error && (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {actions.error}
          </Text>
        )}
      </View>
    );
  }

  const next = item.next!;
  if (status === "due") {
    const waiting = dueOccurrenceCount(item.record, now);
    const when =
      next.getFullYear() === now.getFullYear()
        ? formatDayMonth(next)
        : formatDate(next);
    return (
      <View
        className="gap-4 rounded-[24px] p-4"
        style={{
          ...CONTINUOUS,
          borderWidth: 1,
          borderColor: colorWithAlpha(c.danger, 0.32),
          backgroundColor: colorWithAlpha(c.danger, c.isDark ? 0.1 : 0.06),
        }}
      >
        <View className="flex-row items-center gap-3.5">
          <RowIcon name="clock" color={c.danger} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="font-manrope-bold text-[17px] text-danger">
              {t("recurring.overdue")}
            </Text>
            <Text className="text-[13px] text-muted">
              {t("recurring.dueSince", { date: `${when}, ${time(next)}` })}
              {waiting > 1 ? ` · ${t("recurring.waiting", { count: waiting })}` : ""}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            isDisabled={disabled}
            accessibilityState={{ busy: busyAction === "skip" }}
            onPress={() => actions.skip(item)}
          >
            <BusyButtonLabel
              label={t("recurring.skip")}
              busy={busyAction === "skip"}
              spinnerColor={c.accent}
            />
          </Button>
          <Button
            variant="primary"
            className="flex-[2]"
            isDisabled={disabled}
            accessibilityState={{ busy: busyAction === "process" }}
            onPress={() => actions.process(item)}
          >
            <BusyButtonLabel
              label={t("recurring.process")}
              busy={busyAction === "process"}
              spinnerColor={c.accentForeground}
            />
          </Button>
        </View>
        {!!actions.error && (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            {actions.error}
          </Text>
        )}
      </View>
    );
  }

  const days = calendarDayDistance(next, now);
  const countdown =
    days <= 0
      ? t("recurring.today")
      : days === 1
        ? t("recurring.tomorrow")
        : t("recurring.inDays", { count: days });
  const index = Number(item.record.nextIndex ?? 0);
  const previous = index > 0 ? occurrenceDate(item.record, index - 1) : null;
  const fraction =
    previous && next > previous
      ? Math.min(
          1,
          Math.max(
            0,
            (now.getTime() - previous.getTime()) /
              (next.getTime() - previous.getTime()),
          ),
        )
      : null;
  return (
    <View
      className="gap-4 rounded-[24px] border border-border bg-surface p-4"
      style={CONTINUOUS}
    >
      <View className="flex-row items-center gap-3.5">
        <RowIcon name="calendar" color={c.accent} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-[12px] leading-[17px] text-muted">
            {t("recurring.nextPayment")}
          </Text>
          <Text className="font-manrope-bold text-[17px] text-foreground">
            {formatDate(next)}
          </Text>
          <Text className="text-[13px] text-muted">
            {next.toLocaleDateString(i18n.resolvedLanguage, {
              weekday: "long",
            })}{" "}
            · {time(next)}
          </Text>
        </View>
        <View
          className="rounded-full px-3 py-1.5"
          style={{ backgroundColor: colorWithAlpha(c.accent, 0.14) }}
        >
          <Text className="font-manrope-bold text-[13px] text-accent">
            {countdown}
          </Text>
        </View>
      </View>
      {fraction !== null && (
        <OccurrenceProgress
          fraction={fraction}
          trackColor={c.surfaceSecondary}
          fillColor={c.accent}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        className="self-center"
        isDisabled={disabled}
        accessibilityState={{ busy: busyAction === "skip" }}
        onPress={() => actions.skip(item)}
      >
        <BusyButtonLabel
          label={t("recurring.skipNext")}
          busy={busyAction === "skip"}
          spinnerColor={c.accent}
        />
      </Button>
      {!!actions.error && (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {actions.error}
        </Text>
      )}
    </View>
  );
}

function History({
  item,
  onOpenTransaction,
}: {
  item: Recurring;
  onOpenTransaction: (id: string) => void;
}) {
  const c = useAppThemeColors(),
    { t } = useTranslation();
  const { formatDate } = useAppDate();
  const [expanded, setExpanded] = useState(false);
  const entries = [...item.history].reverse();
  const processed = item.history.filter((h) => h.status === "processed");
  const totals = recurringTotals(
    processed.map((h) => ({
      amount: Number(h.amount),
      currencyCode: String(h.currencyCode),
    })),
  );
  const { formatCurrency } = useCurrencyFormat();
  const visible = expanded ? entries : entries.slice(0, HISTORY_PREVIEW);
  return (
    <FormCard title={t("recurring.history")} icon="history">
      {!entries.length ? (
        <Text className="text-[15px] text-muted">
          {t("recurring.noHistory")}
        </Text>
      ) : (
        <>
          <View className="flex-row gap-2">
            <View
              className="min-w-0 flex-1 gap-1 rounded-[18px] p-3"
              style={{ ...CONTINUOUS, backgroundColor: c.surfaceSecondary }}
            >
              <Text className="text-[12px] text-muted">
                {t("recurring.total")}
              </Text>
              {(totals.length
                ? totals
                : [{ amount: 0, currencyCode: item.currencyCode }]
              ).map((total) => (
                <Text
                  key={total.currencyCode}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  className="font-manrope-bold text-[17px] text-foreground"
                  style={{ ...TABULAR, writingDirection: "ltr" }}
                >
                  {formatCurrency(total.amount, total.currencyCode)}
                </Text>
              ))}
            </View>
            <View
              className="min-w-0 flex-1 gap-1 rounded-[18px] p-3"
              style={{ ...CONTINUOUS, backgroundColor: c.surfaceSecondary }}
            >
              <Text className="text-[12px] text-muted">
                {t("recurring.occurrences")}
              </Text>
              <Text
                className="font-manrope-bold text-[17px] text-foreground"
                style={TABULAR}
              >
                {processed.length}
              </Text>
            </View>
          </View>
          <View>
            {visible.map((h, index) => {
              const skipped = h.status === "skipped";
              const transactionId =
                typeof h.transactionId === "string" ? h.transactionId : null;
              const scheduled = new Date(String(h.scheduledAt));
              return (
                <Fragment key={String(h.key ?? index)}>
                  {index > 0 && (
                    <View
                      style={{
                        height: StyleSheet.hairlineWidth,
                        backgroundColor: c.border,
                        marginStart: 52,
                      }}
                    />
                  )}
                  <Pressable
                    accessibilityRole={transactionId ? "button" : "text"}
                    disabled={!transactionId}
                    onPress={() =>
                      transactionId && onOpenTransaction(transactionId)
                    }
                    className="flex-row items-center gap-3 py-3"
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <RowIcon
                      name={skipped ? "close" : "check"}
                      color={skipped ? c.muted : c.success}
                    />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text
                        className="font-manrope-semibold text-[15px]"
                        style={{ color: skipped ? c.muted : c.foreground }}
                      >
                        {formatDate(scheduled)}
                      </Text>
                      <Text className="text-[13px] text-muted">
                        {t(skipped ? "recurring.skipped" : "recurring.processed")}
                      </Text>
                    </View>
                    <RecurringAmount
                      amount={Number(h.amount)}
                      currencyCode={String(h.currencyCode)}
                      type={Number(h.type ?? item.type)}
                      muted={skipped}
                    />
                    {transactionId && (
                      <FilledIcon name="chevron-right" size={20} tone="muted" />
                    )}
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
          {entries.length > HISTORY_PREVIEW && (
            <Button variant="ghost" onPress={() => setExpanded(!expanded)}>
              <Button.Label>
                {expanded
                  ? t("recurring.showLess")
                  : t("recurring.showAll", { count: entries.length })}
              </Button.Label>
            </Button>
          )}
        </>
      )}
    </FormCard>
  );
}

export function RecurringDetailsScreen({ id }: { id: string }) {
  const { document, updateDocument } = useLocalData(),
    { activeProfileId } = useProfiles(),
    router = useRouter(),
    { t } = useTranslation(),
    c = useAppThemeColors(),
    insets = useSafeAreaInsets(),
    { formatDate, formatDateTime } = useAppDate(),
    now = useRecurringClock();
  const item = selectRecurrings(document, now).find((r) => r.id === id);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [transactionId, setTransactionId] = useState<string | null>(null);
  const transaction = transactionId
    ? selectTransactions(document).find((v) => v.id === transactionId)
    : null;
  async function change(action: "archive" | "automatic" | "delete") {
    if (busy || !item) return;
    setBusy(true);
    setError("");
    try {
      await updateDocument((current) => {
        const record = current.recurrings.find((r) => identity(r) === id);
        if (!record || !belongsToProfile(current, record, activeProfileId))
          throw new Error(t("recurring.missing"));
        return {
          ...current,
          recurrings:
            action === "delete"
              ? current.recurrings.filter((r) => identity(r) !== id)
              : current.recurrings.map((r) =>
                  identity(r) !== id
                    ? r
                    : {
                        ...r,
                        ...(action === "archive"
                          ? { archived: !r.archived }
                          : { automatic: !r.automatic }),
                        updatedAt: new Date().toISOString(),
                      },
                ),
        };
      });
      if (action === "delete") {
        if (router.canGoBack()) router.back();
        else router.replace("/recurring");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("recurring.error"));
    } finally {
      setBusy(false);
    }
  }
  const confirmDelete = () =>
    AppAlert.alert(t("recurring.delete"), t("recurring.deleteBody"), [
      { text: t("recurring.cancel"), style: "cancel" },
      {
        text: t("recurring.confirm"),
        style: "destructive",
        onPress: () => {
          void change("delete");
        },
      },
    ]);
  // Optional links appear only when the person set them.
  const relation = (
    collection: "budgets" | "labels" | "places" | "peoples",
    value: string | undefined,
  ) =>
    value
      ? selectRecurringRelations(document, collection).find(
          (r) => r.id === value,
        )?.name
      : undefined;
  const links = item
    ? (
        [
          ["budget", "piggy-bank", relation("budgets", item.budget)],
          ["label", "tag", relation("labels", item.label)],
          ["place", "map-marker", relation("places", item.place)],
          ["person", "account", relation("peoples", item.person)],
        ] as const
      ).filter(([, , name]) => !!name)
    : [];
  const reminder = item
    ? t(
        item.reminderDays === null
          ? "recurring.noReminder"
          : item.reminderDays === 0
            ? "recurring.reminderAt"
            : "recurring.reminderBefore",
        { count: item.reminderDays ?? 0 },
      )
    : "";
  const archivedByPerson = item?.record.archived === true;
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          gap: 16,
          paddingBottom: 48 + insets.bottom,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <CollapsingHeaderSpacer />
        {!item ? (
          <View className="items-center gap-3 px-6 py-16">
            <FilledIcon name="magnify-close" size={48} tone="muted" />
            <Text className="text-center text-[15px] text-muted">
              {t("recurring.missing")}
            </Text>
          </View>
        ) : (
          <>
            <Hero item={item} now={now} />
            {!!error && (
              <View
                className="rounded-[20px] p-3 ps-4"
                style={{
                  ...CONTINUOUS,
                  backgroundColor: colorWithAlpha(c.danger, 0.1),
                }}
              >
                <Text accessibilityRole="alert" className="text-sm text-danger">
                  {error}
                </Text>
              </View>
            )}
            <StatusCard
              item={item}
              now={now}
              busy={busy}
              onRestore={() => {
                void change("archive");
              }}
            />
            <FormCard title={t("recurring.schedule")} icon="event-repeat">
              <Rows>
                {[
                  <DetailRow
                    key="account"
                    icon="wallet"
                    label={t("recurring.account")}
                    value={item.accountName}
                  />,
                  <DetailRow
                    key="category"
                    icon="shopping"
                    label={t("recurring.category")}
                    value={item.categoryName}
                  />,
                  <DetailRow
                    key="start"
                    icon="calendar"
                    label={t("recurring.start")}
                    value={formatDateTime(new Date(item.startAt))}
                  />,
                  <DetailRow
                    key="end"
                    icon="calendar"
                    label={t("recurring.end")}
                    value={
                      item.endAt
                        ? formatDate(new Date(item.endAt))
                        : t("recurring.noEnd")
                    }
                  />,
                  <DetailRow
                    key="reminder"
                    icon="bell"
                    label={t("recurring.reminder")}
                    value={reminder}
                  />,
                  ...links.map(([key, icon, name]) => (
                    <DetailRow
                      key={key}
                      icon={icon}
                      label={t(`recurring.${key}`)}
                      value={name!}
                    />
                  )),
                  item.description.trim() ? (
                    <DetailRow
                      key="notes"
                      icon="notes"
                      label={t("recurring.description")}
                      value={item.description.trim()}
                      multiline
                    />
                  ) : null,
                  <SwitchRow
                    key="automatic"
                    icon="swap-horizontal"
                    title={t("recurring.automatic")}
                    description={t("recurring.automaticHint")}
                    value={item.automatic}
                    disabled={busy}
                    onChange={() => {
                      void change("automatic");
                    }}
                  />,
                ]}
              </Rows>
            </FormCard>
            <History item={item} onOpenTransaction={setTransactionId} />
            <View className="gap-2 pt-2">
              {!archivedByPerson && (
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => {
                    void change("archive");
                  }}
                >
                  <FilledIcon name="database-import" size={20} tone="accent" />
                  <Button.Label>{t("recurring.archive")}</Button.Label>
                </Button>
              )}
              <Button variant="danger-soft" isDisabled={busy} onPress={confirmDelete}>
                <FilledIcon name="delete" size={20} tone="danger" />
                <Button.Label>{t("recurring.delete")}</Button.Label>
              </Button>
            </View>
          </>
        )}
      </Animated.ScrollView>
      <CollapsingHeader
        horizontalInset={14}
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <BudgetHeader
          title={t("recurring.details")}
          disabled={busy}
          horizontalPadding={0}
        >
          {item && (
            <Button
              isIconOnly
              variant="ghost"
              isDisabled={busy}
              accessibilityLabel={t("recurring.edit")}
              onPress={() =>
                router.push({ pathname: "/recurring/[id]/edit", params: { id } })
              }
            >
              <FilledIcon name="pencil" size={24} />
            </Button>
          )}
        </BudgetHeader>
      </CollapsingHeader>
      <RecurringScrim />
      {transaction && (
        <TransactionDetailSheet
          transaction={transaction}
          onDismiss={() => setTransactionId(null)}
        />
      )}
    </View>
  );
}
