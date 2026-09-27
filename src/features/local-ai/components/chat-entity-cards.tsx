import { useMemo, type ReactNode } from "react";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import { identity } from "@/data/model/category-record";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import { selectCategories } from "@/data/selectors/category-selectors";
import { selectAccounts } from "@/data/selectors/document-selectors";
import { selectRecurrings } from "@/data/selectors/recurring-selectors";
import {
  createTransactionIndex,
  createTransactionProjector,
} from "@/data/selectors/transaction-selectors";
import type { Transaction } from "@/features/home/types";
import { useRecurringActions } from "@/features/recurring/use-recurring-actions";
import { useAppDate } from "@/shared/lib/use-app-date";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import { budgetPace } from "../tools/budget-tools";
import { selectFinancialPriorities } from "../tools/core-tools";
import { ToolContext, type ChatCard } from "../tools/tool-context";
import { assetValue, goalValues } from "../tools/wealth-tools";

export type EntityCard = Exclude<ChatCard, { kind: "change_proposal" }>;
type Tone = "good" | "warning" | "bad" | "neutral";

/** Every live projection the cards need, built once per document change. */
export function useEntityData() {
  const { document } = useLocalData();
  const { i18n } = useTranslation();
  return useMemo(() => {
    const context = new ToolContext(document, new Date());
    const index = createTransactionIndex(document);
    const project = createTransactionProjector(document, i18n.resolvedLanguage);
    const transactions = new Map(index.map((entry) => [entry.id, entry]));
    let priorities: ReturnType<typeof selectFinancialPriorities> | null = null;
    return {
      context,
      transaction: (id: string) => {
        const entry = transactions.get(id);
        return entry ? project(entry) : null;
      },
      accounts: selectAccounts(document),
      budgets: selectBudgets(document),
      categories: selectCategories(document),
      recurrings: selectRecurrings(document),
      priorities: () => (priorities ??= selectFinancialPriorities(context)),
    };
  }, [document, i18n.resolvedLanguage]);
}

type EntityData = ReturnType<typeof useEntityData>;

function useToneColor() {
  const colors = useAppThemeColors();
  return (tone: Tone) =>
    tone === "good" ? colors.success : tone === "bad" ? colors.danger : tone === "warning" ? "#e0a030" : colors.muted;
}

function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  const color = useToneColor()(tone);
  return (
    <View className="self-start rounded-full px-2 py-0.5" style={{ backgroundColor: colorWithAlpha(color, 0.16) }}>
      <Text className="font-manrope-semibold text-[11px]" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

function Meter({ value, tone }: { value: number; tone: Tone }) {
  const colors = useAppThemeColors();
  const color = useToneColor()(tone);
  return (
    <View className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: colors.border }}>
      <View className="h-full rounded-full" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, backgroundColor: color }} />
    </View>
  );
}

/** Shared chat card shell: icon, title, subtitle, value and an optional footer. */
function Shell({
  icon,
  iconPath,
  materialIcon,
  color,
  title,
  subtitle,
  value,
  valueTone,
  footer,
  onPress,
  kindLabel,
}: {
  icon?: string;
  iconPath?: string | null;
  materialIcon?: FilledIconName;
  color: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: Tone;
  footer?: ReactNode;
  onPress?: () => void;
  kindLabel: string;
}) {
  const colors = useAppThemeColors();
  const toneColor = useToneColor();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${kindLabel}: ${title}${value ? `, ${value}` : ""}`}
      disabled={!onPress}
      onPress={onPress}
      className="gap-2.5 rounded-2xl border bg-background px-3 py-2.5"
      style={({ pressed }) => ({ borderColor: colorWithAlpha(color, 0.35), opacity: pressed ? 0.7 : 1 })}
    >
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-xl" style={{ backgroundColor: colorWithAlpha(color, 0.18) }}>
          {materialIcon ? (
            <FilledIcon name={materialIcon} size={20} color={color} />
          ) : (
            <RecordIcon color={color} name={icon ?? "wallet"} pathData={iconPath ?? null} size={20} />
          )}
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="font-manrope-semibold text-[15px] text-foreground">
            {title}
          </Text>
          {!!subtitle && (
            <Text numberOfLines={1} className="text-[12px] text-muted">
              {subtitle}
            </Text>
          )}
        </View>
        {!!value && (
          <Text className="font-manrope-bold text-[15px]" style={{ color: valueTone ? toneColor(valueTone) : colors.foreground }}>
            {value}
          </Text>
        )}
        {onPress && <FilledIcon name="chevron-right" size={18} tone="muted" />}
      </View>
      {footer}
    </Pressable>
  );
}

function RecurringFooter({ item }: { item: EntityData["recurrings"][number] }) {
  const { t } = useTranslation();
  const actions = useRecurringActions();
  if (!item.due || item.archived) return null;
  return (
    <View className="flex-row justify-end gap-2">
      <Pressable accessibilityRole="button" disabled={!!actions.busy} onPress={() => actions.skip(item)} className="rounded-full border border-border px-3 py-1.5">
        <Text className="text-[13px] text-foreground">{t("recurring.skip", { defaultValue: "Skip" })}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!!actions.busy} onPress={() => actions.process(item)} className="rounded-full bg-accent px-3 py-1.5">
        <Text className="font-manrope-semibold text-[13px] text-background">{t("recurring.process", { defaultValue: "Process" })}</Text>
      </Pressable>
    </View>
  );
}

/**
 * One record rendered for the chat: compact, with a status reading computed
 * from live data and a tap target that opens the app's own screen or sheet.
 */
export function ChatEntityCard({
  card,
  data,
  onTransaction,
}: {
  card: EntityCard;
  data: EntityData;
  onTransaction: (transaction: Transaction) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useAppThemeColors();
  const { formatCurrency } = useCurrencyFormat();
  const { formatDate } = useAppDate();
  const kind = t(`localAI.mentions.kinds.${card.kind}`);
  switch (card.kind) {
    case "transaction": {
      const transaction = data.transaction(card.id);
      if (!transaction) return null;
      const tone: Tone = transaction.type === 1 ? "good" : transaction.type === 2 ? "neutral" : "bad";
      return (
        <Shell
          kindLabel={kind}
          icon={transaction.icon}
          iconPath={transaction.iconPath}
          color={transaction.color}
          title={transaction.merchant}
          subtitle={[transaction.category, transaction.occurredAt, transaction.accountName].filter(Boolean).join(" · ")}
          value={`${transaction.type === 1 ? "+" : transaction.type === 0 ? "−" : ""}${formatCurrency(transaction.absoluteAmount, transaction.currencyCode)}`}
          valueTone={tone === "neutral" ? undefined : tone}
          onPress={() => onTransaction(transaction)}
        />
      );
    }
    case "account": {
      const account = data.accounts.find((item) => item.id === card.id);
      if (!account) return null;
      let status: { tone: Tone; label: string };
      if (account.isExcluded) status = { tone: "neutral", label: t("localAI.mentions.status.excluded") };
      else if (account.kind === "credit")
        status =
          account.creditLimit == null
            ? { tone: "neutral", label: t("localAI.mentions.status.card") }
            : {
                tone: account.creditUtilization >= 70 ? "bad" : account.creditUtilization >= 30 ? "warning" : "good",
                label: t("localAI.mentions.status.creditUse", { percent: account.creditUtilization }),
              };
      else if (account.balance < 0) status = { tone: "bad", label: t("localAI.mentions.status.overdraft") };
      else if (account.kind === "savings") status = { tone: "good", label: t("localAI.mentions.status.savings") };
      else if (account.monthlyIncome > 0 && account.monthlyExpense > account.monthlyIncome)
        status = { tone: "warning", label: t("localAI.mentions.status.spendingAboveIncome") };
      else status = { tone: "good", label: t("localAI.mentions.status.healthy") };
      return (
        <Shell
          kindLabel={kind}
          icon={account.icon}
          iconPath={account.iconPath}
          color={account.color}
          title={account.name}
          subtitle={[account.institution, account.lastFour ? `•• ${account.lastFour}` : ""].filter(Boolean).join(" · ")}
          value={formatCurrency(account.balance, account.currencyCode)}
          valueTone={account.balance < 0 ? "bad" : undefined}
          onPress={() => router.push({ pathname: "/accounts/[id]", params: { id: account.id } })}
          footer={
            <View className="gap-1.5">
              <View className="flex-row flex-wrap items-center gap-2">
                <StatusChip tone={status.tone} label={status.label} />
                {account.kind !== "credit" && (account.monthlyIncome > 0 || account.monthlyExpense > 0) && (
                  <Text className="text-[12px] text-muted">
                    {t("localAI.mentions.monthFlow", {
                      income: formatCurrency(account.monthlyIncome, account.currencyCode),
                      expense: formatCurrency(account.monthlyExpense, account.currencyCode),
                    })}
                  </Text>
                )}
              </View>
              {account.kind === "credit" && account.creditLimit ? (
                <Meter value={account.creditUtilization / 100} tone={status.tone} />
              ) : null}
            </View>
          }
        />
      );
    }
    case "budget": {
      const budget = data.budgets.find((item) => item.id === card.id);
      if (!budget) return null;
      const pace = budgetPace(budget, data.context.now);
      const tone: Tone = pace.status === "over_budget" ? "bad" : pace.status === "at_risk" ? "warning" : "good";
      return (
        <Shell
          kindLabel={kind}
          icon={budget.icon}
          iconPath={budget.iconPath}
          color={budget.color}
          title={budget.name}
          subtitle={t("localAI.mentions.budgetSpent", {
            spent: formatCurrency(budget.tracked, budget.currencyCode),
            limit: formatCurrency(budget.limit, budget.currencyCode),
          })}
          value={`${Math.round(budget.percent)}%`}
          valueTone={tone}
          onPress={() => router.push({ pathname: "/budgets/[id]", params: { id: budget.id } })}
          footer={
            <View className="gap-1.5">
              <Meter value={budget.percent / 100} tone={tone} />
              <View className="flex-row flex-wrap items-center gap-2">
                <StatusChip tone={tone} label={t(`localAI.mentions.status.${pace.status}`)} />
                <Text className="text-[12px] text-muted">
                  {budget.remaining >= 0
                    ? t("localAI.mentions.budgetLeft", { amount: formatCurrency(budget.remaining, budget.currencyCode), days: budget.daysLeft })
                    : t("localAI.mentions.budgetOver", { amount: formatCurrency(-budget.remaining, budget.currencyCode) })}
                </Text>
              </View>
            </View>
          }
        />
      );
    }
    case "recurring": {
      const item = data.recurrings.find((entry) => entry.id === card.id);
      if (!item) return null;
      return (
        <Shell
          kindLabel={kind}
          icon={item.icon}
          iconPath={item.iconPath}
          color={item.color}
          title={item.name}
          subtitle={[t(`recurring.periods.${item.period}`, { defaultValue: item.period }), item.accountName].join(" · ")}
          value={`${item.type === 1 ? "+" : "−"}${formatCurrency(item.amount, item.currencyCode)}`}
          valueTone={item.type === 1 ? "good" : undefined}
          onPress={() => router.push({ pathname: "/recurring/[id]", params: { id: item.id } })}
          footer={
            <View className="gap-2">
              <StatusChip
                tone={item.archived ? "neutral" : item.due ? "warning" : "good"}
                label={
                  item.archived
                    ? t("localAI.mentions.status.archived")
                    : item.due
                      ? t("localAI.mentions.status.due")
                      : item.next
                        ? t("localAI.mentions.nextOn", { date: formatDate(item.next) })
                        : t("localAI.mentions.status.ended")
                }
              />
              <RecurringFooter item={item} />
            </View>
          }
        />
      );
    }
    case "category": {
      const category = data.categories.find((item) => item.id === card.id);
      if (!category) return null;
      const month = data.context.monthlyTotals(1)[0];
      const spent = data.context
        .facts(month)
        .filter((fact) => data.context.counted(fact) && fact.categoryPath.includes(category.id) && fact.reportingCurrency === data.context.reporting)
        .reduce((sum, fact) => sum + fact.reportingAmount, 0);
      return (
        <Shell
          kindLabel={kind}
          icon={category.icon}
          iconPath={category.iconPath}
          color={category.color}
          title={category.name}
          subtitle={t("localAI.mentions.thisMonth")}
          value={formatCurrency(spent, data.context.reporting)}
          onPress={() => router.push({ pathname: "/categories/[id]", params: { id: category.id } })}
        />
      );
    }
    case "goal": {
      const record = data.context.records("goals").find((item) => identity(item) === card.id);
      if (!record) return null;
      const goal = goalValues(data.context, record);
      const progress = goal.target > 0 ? goal.current / goal.target : 0;
      return (
        <Shell
          kindLabel={kind}
          materialIcon="trophy"
          color={colors.accent}
          title={goal.name}
          subtitle={goal.date ? t("localAI.mentions.targetBy", { date: formatDate(goal.date) }) : undefined}
          value={`${Math.round(progress * 100)}%`}
          footer={
            <View className="gap-1.5">
              <Meter value={progress} tone={progress >= 1 ? "good" : "warning"} />
              <Text className="text-[12px] text-muted">
                {`${formatCurrency(goal.current, goal.currency)} / ${formatCurrency(goal.target, goal.currency)}`}
              </Text>
            </View>
          }
        />
      );
    }
    case "loan": {
      const record = data.context.records("loans").find((item) => identity(item) === card.id);
      if (!record) return null;
      const due = typeof record.dueDate === "string" ? new Date(record.dueDate) : null;
      const overdue = !!due && due.getTime() < data.context.now.getTime();
      return (
        <Shell
          kindLabel={kind}
          materialIcon="receipt"
          color={colors.danger}
          title={String(record.name ?? kind)}
          subtitle={typeof record.interestRate === "number" ? t("localAI.mentions.interest", { rate: record.interestRate }) : undefined}
          value={formatCurrency(Math.abs(Number(record.amount) || 0), String(record.currencyCode ?? data.context.currency))}
          footer={
            due && Number.isFinite(due.getTime()) ? (
              <StatusChip tone={overdue ? "bad" : "warning"} label={t(overdue ? "localAI.mentions.overdueSince" : "localAI.mentions.dueOn", { date: formatDate(due) })} />
            ) : undefined
          }
        />
      );
    }
    case "asset": {
      const record = data.context.records("assets").find((item) => identity(item) === card.id);
      if (!record) return null;
      return (
        <Shell
          kindLabel={kind}
          materialIcon="home-variant"
          color={colors.success}
          title={String(record.name ?? kind)}
          subtitle={typeof record.category === "string" ? record.category : undefined}
          value={formatCurrency(assetValue(record), String(record.currencyCode ?? data.context.currency))}
        />
      );
    }
    case "financial_priority": {
      const priority = data.priorities().find((item) => item.id === card.id);
      if (!priority) return null;
      const tone: Tone = priority.severity === "critical" ? "bad" : priority.severity === "warning" ? "warning" : priority.severity === "opportunity" ? "good" : "neutral";
      const target = priority.entity;
      return (
        <Shell
          kindLabel={kind}
          materialIcon={priority.severity === "opportunity" ? "trending-down" : "bell"}
          color={toneColorOf(tone, colors)}
          title={t(`localAI.priorities.${priority.titleCode}`)}
          value={
            priority.impactAmount != null
              ? `${formatCurrency(priority.impactAmount, priority.impactCurrency ?? data.context.currency)}${priority.impactPeriod === "month" ? t("localAI.priorities.perMonth") : priority.impactPeriod === "year" ? t("localAI.priorities.perYear") : ""}`
              : undefined
          }
          valueTone={tone}
          onPress={
            target?.kind === "account" || target?.kind === "budget" || target?.kind === "category" || target?.kind === "recurring"
              ? () =>
                  router.push({
                    pathname:
                      target.kind === "account"
                        ? "/accounts/[id]"
                        : target.kind === "budget"
                          ? "/budgets/[id]"
                          : target.kind === "category"
                            ? "/categories/[id]"
                            : "/recurring/[id]",
                    params: { id: target.id },
                  })
              : undefined
          }
          footer={<StatusChip tone={tone} label={t(`localAI.mentions.severity.${priority.severity}`)} />}
        />
      );
    }
  }
}

function toneColorOf(tone: Tone, colors: ReturnType<typeof useAppThemeColors>) {
  return tone === "good" ? colors.success : tone === "bad" ? colors.danger : tone === "warning" ? "#e0a030" : colors.muted;
}

/** The record's display name, for a mention written inside a sentence. */
export function entityLabel(card: EntityCard, data: EntityData): string | null {
  switch (card.kind) {
    case "transaction":
      return data.transaction(card.id)?.merchant ?? null;
    case "account":
      return data.accounts.find((item) => item.id === card.id)?.name ?? null;
    case "budget":
      return data.budgets.find((item) => item.id === card.id)?.name ?? null;
    case "recurring":
      return data.recurrings.find((item) => item.id === card.id)?.name ?? null;
    case "category":
      return data.categories.find((item) => item.id === card.id)?.name ?? null;
    case "goal":
    case "loan":
    case "asset": {
      const key = card.kind === "goal" ? "goals" : card.kind === "loan" ? "loans" : "assets";
      const record = data.context.records(key).find((item) => identity(item) === card.id);
      return record ? String(record.name ?? "") || null : null;
    }
    case "financial_priority":
      return null;
  }
}
