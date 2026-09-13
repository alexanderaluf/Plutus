import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Animated, Pressable, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useLocalData } from "@/data/local-data-provider";
import { belongsToProfile, identity } from "@/data/model/category-record";
import { occurrenceDate } from "@/data/model/recurring-record";
import {
  selectRecurrings,
  selectRecurringSummary,
  recurringTotals,
  selectTransactions,
} from "@/data/selectors/document-selectors";
import {
  BudgetHeader,
  BudgetToggle,
} from "@/features/budgets/components/budget-ui";
import { useProfiles } from "@/features/profile/profile-provider";
import { TransactionDetailSheet } from "@/features/transactions/transaction-detail-sheet";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import {
  MoneyLines,
  RecurringBadge,
  RecurringScrim,
} from "./components/recurring-ui";
import { useRecurringActions } from "./use-recurring-actions";
import { useRecurringClock } from "./recurring-screen";

export function RecurringDetailsScreen({ id }: { id: string }) {
  const { document, updateDocument } = useLocalData(),
    { activeProfileId, activeProfile } = useProfiles(),
    router = useRouter(),
    { t, i18n } = useTranslation(),
    c = useAppThemeColors(),
    insets = useSafeAreaInsets(),
    now = useRecurringClock();
  const item = selectRecurrings(document, now).find((r) => r.id === id),
    actions = useRecurringActions();
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
  const date = (value: string | Date) =>
    new Date(value).toLocaleString(i18n.resolvedLanguage, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const days = item?.next
    ? Math.max(0, Math.ceil((item.next.getTime() - now.getTime()) / 86_400_000))
    : 0;
  const index = Number(item?.record.nextIndex ?? 0),
    previous = item
      ? occurrenceDate(item.record, Math.max(0, index - 1))
      : null;
  const fraction =
    item?.next && previous && item.next > previous
      ? Math.min(
          1,
          Math.max(
            0,
            (now.getTime() - previous.getTime()) /
              (item.next.getTime() - previous.getTime()),
          ),
        )
      : 0;
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <Animated.ScrollView
        contentContainerStyle={{
          padding: 14,
          gap: 22,
          paddingBottom: 120 + insets.bottom,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <CollapsingHeaderSpacer />
        {!item ? (
          <Text className="p-8 text-muted">{t("recurring.missing")}</Text>
        ) : (
          <>
            <View
              style={{
                backgroundColor: colorWithAlpha(item.color, 0.38),
                borderColor: colorWithAlpha(item.color, 0.65),
                borderWidth: 1,
                borderRadius: 30,
                padding: 20,
                gap: 24,
              }}
            >
              <View className="flex-row items-center gap-3">
                <RecurringBadge item={item} />
                <View className="flex-1 gap-1">
                  <Text className="font-manrope-bold text-xl text-foreground">
                    {item.name}
                  </Text>
                  <Text className="text-sm text-foreground">
                    {t(`recurring.periods.${item.period}`, {
                      defaultValue: String(item.period),
                    })}{" "}
                    ·{" "}
                    {t(
                      item.type === 1
                        ? "recurring.income"
                        : "recurring.expense",
                    )}
                  </Text>
                </View>
                <MoneyLines
                  values={[item]}
                  color={item.type === 1 ? c.success : c.danger}
                />
              </View>
              <View className="gap-2 border-t border-border pt-5">
                <Text className="text-sm text-foreground">
                  {t("recurring.nextOccurrence")}
                </Text>
                <Text className="font-manrope-bold text-lg text-foreground">
                  {item.next ? date(item.next) : t("recurring.ended")}
                </Text>
              </View>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{
                  min: 0,
                  max: 100,
                  now: Math.round(fraction * 100),
                }}
              >
                <Svg height={24} width="100%" viewBox="0 0 320 24">
                  <Path
                    d="M4 12 Q14 2 24 12 T64 12 T104 12 T144 12 T184 12 T224 12 T264 12 T304 12"
                    stroke={colorWithAlpha(item.color, 0.5)}
                    strokeWidth={7}
                    fill="none"
                    strokeLinecap="round"
                  />
                  <Path
                    d="M4 12 Q14 2 24 12 T64 12 T104 12 T144 12 T184 12 T224 12 T264 12 T304 12"
                    stroke={c.foreground}
                    strokeWidth={7}
                    fill="none"
                    strokeDasharray={`${Math.max(1, fraction * 340)} 500`}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-sm text-foreground">
                  {t(
                    item.archived
                      ? "recurring.archived"
                      : item.due
                        ? "recurring.overdue"
                        : "recurring.days",
                    { count: days },
                  )}
                </Text>
                <Text className="font-manrope-bold text-foreground">
                  {Math.round(fraction * 100)}%
                </Text>
              </View>
            </View>
            {!!(error || actions.error) && (
              <Text accessibilityRole="alert" className="text-danger">
                {error || actions.error}
              </Text>
            )}
            {!item.archived && item.next && (
              <View className="flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  isDisabled={busy || !!actions.busy}
                  onPress={() => actions.skip(item)}
                >
                  <Button.Label>{t("recurring.skip")}</Button.Label>
                </Button>
                <Button
                  className="flex-1"
                  isDisabled={!item.due || busy || !!actions.busy}
                  onPress={() => actions.process(item)}
                >
                  <Button.Label>
                    {t(
                      actions.busy
                        ? "recurring.processing"
                        : "recurring.process",
                    )}
                  </Button.Label>
                </Button>
              </View>
            )}
            <Text className="font-manrope-semibold text-xl text-foreground">
              {t("recurring.details")}
            </Text>
            <View className="overflow-hidden rounded-[28px] border border-border">
              {(
                [
                  {
                    title: t("recurring.account"),
                    value: item.accountName,
                    icon: "wallet",
                  },
                  {
                    title: t("recurring.category"),
                    value: item.categoryName,
                    icon: "shopping",
                  },
                  {
                    title: t("recurring.start"),
                    value: date(item.startAt),
                    icon: "clock",
                  },
                  {
                    title: t("recurring.period"),
                    value: t(`recurring.periods.${item.period}`, {
                      defaultValue: String(item.period),
                    }),
                    icon: "swap-horizontal",
                  },
                  {
                    title: t("recurring.currency"),
                    value: item.currencyCode,
                    icon: "currency-exchange",
                  },
                  {
                    title: t("recurring.reminder"),
                    value: t(
                      item.reminderDays === null
                        ? "recurring.noReminder"
                        : item.reminderDays === 0
                          ? "recurring.reminderAt"
                          : "recurring.reminderBefore",
                      { count: item.reminderDays ?? 0 },
                    ),
                    icon: "bell",
                  },
                  {
                    title: t("recurring.end"),
                    value: item.endAt ? date(item.endAt) : t("recurring.noEnd"),
                    icon: "clock",
                  },
                ] as const
              ).map((row) => (
                <View
                  key={row.title}
                  className="flex-row items-center gap-4 border-b border-border px-5 py-4"
                >
                  <FilledIcon name={row.icon} tone="accent" size={25} />
                  <View className="flex-1 gap-1">
                    <Text className="text-sm text-muted">{row.title}</Text>
                    <Text className="font-manrope-semibold text-base text-foreground">
                      {row.value}
                    </Text>
                  </View>
                </View>
              ))}
              <View className="px-5">
                <BudgetToggle
                  title={t("recurring.automatic")}
                  description={t(
                    item.automatic
                      ? "recurring.automaticHint"
                      : "recurring.manual",
                  )}
                  value={item.automatic}
                  disabled={busy}
                  onChange={() => {
                    void change("automatic");
                  }}
                />
              </View>
            </View>
            <Text className="font-manrope-semibold text-xl text-foreground">
              {t("recurring.statistics")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <View className="min-w-28 flex-1 gap-2 rounded-3xl border border-border p-4">
                <FilledIcon name="swap-horizontal" size={25} />
                <Text className="font-manrope-bold text-xl text-foreground">
                  {item.history.filter((h) => h.status === "processed").length}
                </Text>
                <Text className="text-xs text-muted">
                  {t("recurring.occurrences")}
                </Text>
              </View>
              <View className="min-w-28 flex-1 gap-2 rounded-3xl border border-border p-4">
                <MoneyLines
                  emptyCurrency={activeProfile.currencyCode}
                  values={recurringTotals(
                    item.history
                      .filter((h) => h.status === "processed")
                      .map((h) => ({
                        amount: Number(h.amount),
                        currencyCode: String(h.currencyCode),
                      })),
                  )}
                />
                <Text className="text-xs text-muted">
                  {t("recurring.total")}
                </Text>
              </View>
              <View className="min-w-28 flex-1 gap-2 rounded-3xl border border-border p-4">
                <MoneyLines
                  values={selectRecurringSummary([item], now).monthly}
                  emptyCurrency={item.currencyCode}
                />
                <Text className="text-xs text-muted">
                  {t("recurring.monthly")}
                </Text>
              </View>
            </View>
            <Text className="font-manrope-semibold text-xl text-foreground">
              {t("recurring.history")}
            </Text>
            {!item.history.length && (
              <Text className="text-muted">{t("recurring.noHistory")}</Text>
            )}
            {[...item.history].reverse().map((h) => (
              <Pressable
                key={String(h.key)}
                accessibilityRole="button"
                disabled={!h.transactionId}
                onPress={() => setTransactionId(String(h.transactionId))}
                className="flex-row items-center gap-3 rounded-2xl bg-surface p-4"
              >
                <View className="flex-1 gap-1">
                  <Text className="font-manrope-semibold text-foreground">
                    {date(String(h.scheduledAt))}
                  </Text>
                  <Text className="text-sm text-muted">
                    {t(
                      h.status === "skipped"
                        ? "recurring.skipped"
                        : "recurring.processed",
                    )}
                  </Text>
                </View>
                <MoneyLines
                  values={[
                    {
                      amount: Number(h.amount),
                      currencyCode: String(h.currencyCode),
                    },
                  ]}
                />
                {h.transactionId && (
                  <FilledIcon name="chevron-right" size={22} />
                )}
              </Pressable>
            ))}
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
            <>
              <Button
                isIconOnly
                variant="ghost"
                isDisabled={busy}
                accessibilityLabel={t("recurring.delete")}
                onPress={() =>
                  Alert.alert(
                    t("recurring.delete"),
                    t("recurring.deleteBody"),
                    [
                      { text: t("recurring.cancel"), style: "cancel" },
                      {
                        text: t("recurring.confirm"),
                        style: "destructive",
                        onPress: () => {
                          void change("delete");
                        },
                      },
                    ],
                  )
                }
              >
                <FilledIcon name="delete" size={26} tone="danger" />
              </Button>
              <Button
                isIconOnly
                variant="ghost"
                isDisabled={busy}
                accessibilityLabel={t(
                  item.record.archived === true
                    ? "recurring.restore"
                    : "recurring.archive",
                )}
                onPress={() => {
                  void change("archive");
                }}
              >
                <FilledIcon
                  name={
                    item.record.archived === true ? "backup" : "database-import"
                  }
                  size={26}
                />
              </Button>
            </>
          )}
        </BudgetHeader>
      </CollapsingHeader>
      <RecurringScrim />
      {item && (
        <View
          style={{
            position: "absolute",
            right: 20,
            bottom: Math.max(insets.bottom, 10),
            zIndex: 20,
          }}
        >
          <Button
            isDisabled={busy}
            className="h-16 rounded-3xl px-6"
            onPress={() =>
              router.push({ pathname: "/recurring/[id]/edit", params: { id } })
            }
          >
            <FilledIcon name="pencil" size={25} tone="accent-foreground" />
            <Button.Label>{t("recurring.edit")}</Button.Label>
          </Button>
        </View>
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
