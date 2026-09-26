import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  TextInput,
  View,
} from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import { selectCategories } from "@/data/selectors/category-selectors";
import { selectAccounts } from "@/data/selectors/document-selectors";
import { TransactionCategorySheet } from "@/features/transactions/components/transaction-category-sheet";
import {
  TransactionSelectionSection,
  type TransactionOption,
} from "@/features/transactions/components/transaction-selection-section";
import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { colorWithAlpha, useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon, type FilledIconName } from "@/shared/ui/filled-icon";
import { RecordIcon } from "@/shared/ui/record-icon";

import type {
  ChangeFields,
  ChangeFieldValue,
  ChangeProposal,
  EditableField,
  MutationResult,
  ProposalStatus,
  RecordVisual,
} from "../mutations/change-types";
import { localDay } from "../mutations/field-parsers";

const MONEY_FIELDS = new Set([
  "amount",
  "balance",
  "targetAmount",
  "currentAmount",
  "value",
  "totalAmount",
  "creditLimit",
]);

/** Field icons follow the transaction editor's section icons. */
const FIELD_ICONS: Record<string, FilledIconName> = {
  account: "credit-card",
  toAccount: "swap-horizontal",
  linkedBank: "bank",
  category: "chart-donut-variant",
  categories: "chart-donut-variant",
  parent: "chart-donut-variant",
  budget: "wallet",
  label: "tag",
  place: "map-marker",
  person: "account",
  date: "calendar",
  startAt: "calendar",
  endAt: "calendar",
  targetDate: "calendar",
  dueDate: "calendar",
  acquisitionDate: "calendar",
  period: "clock",
  description: "notes",
  notes: "notes",
  currency: "currency-exchange",
  currencyCode: "currency-exchange",
  type: "tune",
  accountType: "tune",
  budgetType: "tune",
  automatic: "cog",
  showOnHome: "home",
  rolling: "swap-horizontal",
  archived: "database-import",
  isDefault: "check",
  isExcluded: "eye-off",
  interestRate: "trending-up",
  paymentDay: "calendar",
  cardLastFour: "credit-card-chip",
  cardCompany: "credit-card",
  bankName: "bank",
};

const OPERATION_ICON: Record<ChangeProposal["operation"], FilledIconName> = {
  create: "plus",
  update: "pencil",
  delete: "delete",
  archive: "database-import",
};

/** Fields already shown in the card header. */
const HEADER_FIELDS = new Set(["name", "amount", "balance", "value", "targetAmount", "totalAmount"]);

function useFormatter(currency: string | null) {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrencyFormat();
  return (field: string, value: ChangeFieldValue) => {
    if (value === null || value === "") return "—";
    if (typeof value === "boolean") return value ? t("localAI.proposal.yes") : t("localAI.proposal.no");
    if (Array.isArray(value)) return value.join(", ") || "—";
    if (typeof value === "number" && MONEY_FIELDS.has(field)) return formatCurrency(value, currency ?? "USD");
    if (field === "type" || field === "accountType" || field === "period")
      return t(`localAI.proposal.values.${String(value)}` as "localAI.proposal.values.expense", {
        defaultValue: String(value),
      });
    return String(value);
  };
}

function Visual({ visual, fallback, size, tint }: { visual?: RecordVisual | null; fallback: FilledIconName; size: number; tint: string }) {
  const color = visual?.color ?? tint;
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: colorWithAlpha(color, 0.18) }}
    >
      {visual ? (
        <RecordIcon color={visual.color} name={visual.icon} pathData={visual.iconPath} size={Math.round(size * 0.5)} />
      ) : (
        <FilledIcon name={fallback} size={Math.round(size * 0.5)} color={color} />
      )}
    </View>
  );
}

function FieldRow({
  field,
  before,
  after,
  proposal,
  format,
}: {
  field: string;
  before: ChangeFieldValue;
  after: ChangeFieldValue;
  proposal: ChangeProposal;
  format: (field: string, value: ChangeFieldValue) => string;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const linked = proposal.fieldVisuals?.[field];
  const removed = proposal.operation === "delete";
  return (
    <View className="min-h-12 flex-row items-center gap-3 py-2">
      <FilledIcon name={FIELD_ICONS[field] ?? "notes"} size={18} tone="muted" />
      <Text className="w-24 text-[13px] text-muted">
        {t(`localAI.fields.${field}` as "localAI.fields.name", { defaultValue: field })}
      </Text>
      <View className="flex-1 flex-row items-center justify-end gap-2">
        {linked && <RecordIcon color={linked.color} name={linked.icon} pathData={linked.iconPath} size={18} />}
        <View className="shrink items-end">
          {proposal.operation === "update" && (
            <Text className="text-[12px] text-muted" style={{ textDecorationLine: "line-through" }}>
              {format(field, before)}
            </Text>
          )}
          <Text
            className="font-manrope-semibold text-[14px]"
            style={{ color: removed ? colors.danger : colors.foreground, textAlign: "right" }}
          >
            {format(field, removed ? before : after)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-full border px-3.5 py-2 ${selected ? "border-accent bg-accent" : "border-border bg-background"}`}
    >
      <Text className={`text-[13px] ${selected ? "font-manrope-semibold text-background" : "text-foreground"}`}>{label}</Text>
    </Pressable>
  );
}

/**
 * The editing form uses the transaction editor's own selection sections and
 * subcategory sheet, so correcting a proposal looks like the rest of the app.
 */
function ProposalEditor({
  fields,
  draft,
  onChange,
}: {
  fields: EditableField[];
  draft: ChangeFields;
  onChange: (field: string, value: ChangeFieldValue) => void;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const { document } = useLocalData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheetParent, setSheetParent] = useState<{ field: string; id: string } | null>(null);
  const accounts = useMemo(() => selectAccounts(document), [document]);
  const categories = useMemo(() => selectCategories(document), [document]);
  const budgets = useMemo(() => selectBudgets(document), [document]);
  const [days] = useState(() => {
    const now = new Date();
    return { today: localDay(now), yesterday: localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) };
  });
  const value = (item: EditableField) => (draft[item.field] !== undefined ? draft[item.field] : item.value);
  const accountOptions: TransactionOption[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    description: `${account.institution} · ${account.currencyCode}`,
    icon: account.icon,
    iconPath: account.iconPath,
    color: account.color,
  }));
  const option = (category: (typeof categories)[number]): TransactionOption => ({
    id: category.id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    iconPath: category.iconPath,
    color: category.color,
  });
  const hasChildren = (id: string) => categories.some((category) => category.parentId === id);
  const rootOf = (id: string) => {
    let current = categories.find((category) => category.id === id);
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      const parentId = current.parentId;
      const parent = categories.find((category) => category.id === parentId);
      if (!parent) break;
      current = parent;
    }
    return current?.id ?? "";
  };
  const descendantsOf = (parentId: string) =>
    categories.filter((category) => {
      if (hasChildren(category.id)) return false;
      const seen = new Set<string>();
      let parent = category.parentId;
      while (parent && !seen.has(parent)) {
        if (parent === parentId) return true;
        seen.add(parent);
        parent = categories.find((candidate) => candidate.id === parent)?.parentId ?? null;
      }
      return false;
    });

  return (
    <View className="gap-3">
      {fields.map((item) => {
        const label = t(`localAI.fields.${item.field}` as "localAI.fields.name", { defaultValue: item.field });
        const current = value(item);
        switch (item.kind) {
          case "account":
            return (
              <TransactionSelectionSection
                key={item.field}
                title={label}
                placeholder={t("transactions.form.selectAccount")}
                icon="credit-card"
                options={accountOptions}
                selectedId={String(current ?? "")}
                expanded={expanded === item.field}
                compactOptions
                onToggle={() => setExpanded((open) => (open === item.field ? null : item.field))}
                onSelect={(id) => {
                  onChange(item.field, id);
                  setExpanded(null);
                }}
              />
            );
          case "category": {
            const roots = categories
              .filter((category) => !category.parentId && (item.categoryType === undefined || category.type === item.categoryType))
              .map(option);
            return (
              <TransactionSelectionSection
                key={item.field}
                title={label}
                placeholder={t("transactions.form.selectCategory")}
                icon="chart-donut-variant"
                options={roots}
                selectedId={current ? rootOf(String(current)) : ""}
                expanded={expanded === item.field}
                compactOptions
                optional={!item.required}
                onToggle={() => setExpanded((open) => (open === item.field ? null : item.field))}
                onSelect={(id) => {
                  if (id && hasChildren(id)) setSheetParent({ field: item.field, id });
                  else {
                    onChange(item.field, id);
                    setExpanded(null);
                  }
                }}
              />
            );
          }
          case "budget":
            return (
              <TransactionSelectionSection
                key={item.field}
                title={label}
                placeholder={t("transactions.form.selectBudget")}
                icon="wallet"
                options={budgets.map((budget) => ({ id: budget.id, name: budget.name, icon: budget.icon, iconPath: budget.iconPath, color: budget.color }))}
                selectedId={String(current ?? "")}
                expanded={expanded === item.field}
                compactOptions
                optional
                onToggle={() => setExpanded((open) => (open === item.field ? null : item.field))}
                onSelect={(id) => onChange(item.field, id)}
              />
            );
          case "choice":
            return (
              <View key={item.field} className="gap-2">
                <Text className="text-[13px] text-muted">{label}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(item.options ?? []).map((choice) => (
                    <Chip
                      key={choice}
                      label={t(`localAI.proposal.values.${choice}` as "localAI.proposal.values.expense", { defaultValue: choice })}
                      selected={current === choice}
                      onPress={() => onChange(item.field, choice)}
                    />
                  ))}
                </View>
              </View>
            );
          case "toggle":
            return (
              <View key={item.field} className="flex-row items-center justify-between py-1">
                <Text className="text-[15px] text-foreground">{label}</Text>
                <Switch value={current === true} onValueChange={(next) => onChange(item.field, next)} />
              </View>
            );
          case "date": {
            const shown = typeof current === "string" && current ? localDay(new Date(current.length === 10 ? `${current}T12:00:00` : current)) : "";
            return (
              <View key={item.field} className="gap-2">
                <Text className="text-[13px] text-muted">{label}</Text>
                <View className="flex-row gap-2">
                  <Chip label={t("localAI.proposal.today")} selected={shown === days.today} onPress={() => onChange(item.field, days.today)} />
                  <Chip label={t("localAI.proposal.yesterday")} selected={shown === days.yesterday} onPress={() => onChange(item.field, days.yesterday)} />
                  <TextInput
                    accessibilityLabel={label}
                    value={shown}
                    onChangeText={(text) => onChange(item.field, text)}
                    placeholder="YYYY-MM-DD"
                    className="h-10 flex-1 rounded-full border border-border bg-background px-3.5 text-[14px] text-foreground"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
            );
          }
          default:
            return (
              <View key={item.field} className="gap-2">
                <Text className="text-[13px] text-muted">{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  value={current == null ? "" : String(current)}
                  onChangeText={(text) => onChange(item.field, text)}
                  keyboardType={item.kind === "amount" ? "decimal-pad" : "default"}
                  className={`min-h-12 rounded-2xl border border-border bg-background px-4 text-foreground ${item.kind === "amount" ? "font-manrope-bold text-[20px]" : "text-[15px]"}`}
                  placeholderTextColor={colors.muted}
                  cursorColor={colors.accent}
                />
              </View>
            );
        }
      })}
      {sheetParent &&
        (() => {
          const parent = categories.find((category) => category.id === sheetParent.id);
          if (!parent) return null;
          return (
            <TransactionCategorySheet
              parent={option(parent)}
              options={descendantsOf(parent.id).map(option)}
              selectedId={String(draft[sheetParent.field] ?? "")}
              onSelect={(id) => {
                onChange(sheetParent.field, id);
                setExpanded(null);
              }}
              onDismiss={() => setSheetParent(null)}
            />
          );
        })()}
    </View>
  );
}

export function ChangeProposalCard({
  proposal,
  status,
  result,
  busy,
  error,
  onConfirm,
  onCancel,
  onRevise,
}: {
  proposal: ChangeProposal;
  status: ProposalStatus;
  result?: MutationResult;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onRevise: (patch: ChangeFields) => void;
}) {
  const { t } = useTranslation();
  const colors = useAppThemeColors();
  const record = proposal.operation === "delete" ? proposal.before : proposal.after;
  const currency =
    (typeof record?.currency === "string" && record.currency) ||
    (typeof record?.currencyCode === "string" && record.currencyCode) ||
    null;
  const format = useFormatter(currency);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ChangeFields>({});
  const pending = status === "pending";
  const tint = proposal.destructive ? colors.danger : colors.accent;
  const entity = t(`localAI.proposal.entities.${proposal.entityType}`);

  // Header amount, signed and colored like transaction rows in the app.
  const headerAmountField = ["amount", "balance", "targetAmount", "value", "totalAmount"].find(
    (field) => typeof record?.[field] === "number",
  );
  const headerAmount = headerAmountField ? (record![headerAmountField] as number) : null;
  const direction = record?.type === "income" ? 1 : record?.type === "expense" ? -1 : 0;
  const amountColor = direction > 0 ? colors.success : direction < 0 ? colors.foreground : colors.foreground;

  const rows =
    proposal.operation === "update"
      ? proposal.changedFields
      : Object.entries(record ?? {})
          .filter(([field, value]) => !HEADER_FIELDS.has(field) && value !== null && value !== "" && !(Array.isArray(value) && !value.length) && value !== false)
          .map(([field, value]) => ({ field, before: value, after: value }));

  const confirm = () => {
    if (!proposal.strongConfirmation) {
      onConfirm();
      return;
    }
    // Irreversible cascades need a second, explicit decision in native UI.
    Alert.alert(
      t("localAI.proposal.strongTitle", { name: proposal.entityName }),
      [
        ...proposal.warnings,
        ...proposal.sideEffects.map((effect) =>
          t(`localAI.sideEffects.${effect.kind}` as "localAI.sideEffects.records_deleted", {
            ...effect.params,
            defaultValue: effect.description,
          }),
        ),
      ].join("\n"),
      [
        { text: t("localAI.proposal.cancel"), style: "cancel" },
        { text: t("localAI.proposal.confirmDelete"), style: "destructive", onPress: onConfirm },
      ],
    );
  };

  const statusLabel = status === "pending" || status === "executing" ? null : t(`localAI.proposal.status.${status}`);
  const statusColor = status === "completed" ? colors.success : status === "cancelled" ? colors.muted : colors.danger;

  return (
    <View
      className="overflow-hidden rounded-[26px] border bg-surface"
      style={{ borderColor: colorWithAlpha(tint, pending ? 0.5 : 0.18) }}
      accessibilityLabel={t("localAI.proposal.cardLabel", { entity, name: proposal.entityName })}
    >
      <View className="gap-3 px-4 pb-3 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: colorWithAlpha(tint, 0.14) }}>
            <FilledIcon name={OPERATION_ICON[proposal.operation]} size={14} color={tint} />
            <Text className="font-manrope-semibold text-[12px]" style={{ color: tint }}>
              {t(`localAI.proposal.titles.${proposal.operation}`, { entity })}
            </Text>
          </View>
          {statusLabel && (
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: colorWithAlpha(statusColor, 0.15) }}>
              <Text className="font-manrope-semibold text-[12px]" style={{ color: statusColor }}>
                {statusLabel}
              </Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-3.5">
          <Visual visual={proposal.visual} fallback={proposal.entityType === "goal" ? "trophy" : proposal.entityType === "loan" ? "receipt" : proposal.entityType === "asset" ? "home-variant" : "wallet"} size={52} tint={tint} />
          <View className="flex-1">
            <Text numberOfLines={2} className="font-manrope-bold text-[18px] text-foreground" style={proposal.operation === "delete" ? { textDecorationLine: "line-through" } : undefined}>
              {proposal.entityName}
            </Text>
            {typeof record?.category === "string" && (
              <Text numberOfLines={1} className="text-[13px] text-muted">
                {record.category}
              </Text>
            )}
          </View>
          {headerAmount !== null && (
            <Text className="font-manrope-bold text-[20px]" style={{ color: proposal.operation === "delete" ? colors.danger : amountColor }}>
              {`${direction > 0 ? "+" : direction < 0 ? "−" : ""}${format(headerAmountField!, headerAmount)}`}
            </Text>
          )}
        </View>
      </View>

      {!editing && rows.length > 0 && (
        <View className="mx-4 rounded-2xl bg-background px-3.5">
          {rows.map((row, index) => (
            <View key={row.field} className={index ? "border-t border-border" : ""}>
              <FieldRow field={row.field} before={row.before} after={row.after} proposal={proposal} format={format} />
            </View>
          ))}
        </View>
      )}

      {pending && editing && (
        <View className="mx-4 gap-3 rounded-2xl bg-background p-3.5">
          <ProposalEditor
            fields={proposal.editableFields}
            draft={draft}
            onChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
          />
          <View className="flex-row justify-end gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDraft({});
                setEditing(false);
              }}
              className="rounded-full px-4 py-2.5"
            >
              <Text className="text-foreground">{t("localAI.proposal.discardEdits")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!Object.keys(draft).length || busy}
              onPress={() => {
                onRevise(draft);
                setDraft({});
                setEditing(false);
              }}
              className="rounded-full bg-accent px-4 py-2.5"
              style={{ opacity: Object.keys(draft).length ? 1 : 0.5 }}
            >
              <Text className="font-manrope-semibold text-background">{t("localAI.proposal.applyEdits")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View className="gap-2 px-4 pt-3">
        {proposal.sideEffects.length > 0 && (
          <View className="gap-1">
            <Text className="font-manrope-semibold text-[13px] text-foreground">{t("localAI.proposal.sideEffects")}</Text>
            {proposal.sideEffects.map((effect, index) => (
              <Text key={`${effect.kind}-${index}`} className="text-[13px] text-muted">
                •{" "}
                {t(`localAI.sideEffects.${effect.kind}` as "localAI.sideEffects.records_deleted", {
                  ...effect.params,
                  collection: effect.params?.collection
                    ? t(`localAI.collections.${String(effect.params.collection)}` as "localAI.collections.accounts", {
                        defaultValue: String(effect.params.collection),
                      })
                    : "",
                  defaultValue: effect.description,
                })}
              </Text>
            ))}
          </View>
        )}
        {proposal.warnings.map((warning) => (
          <View key={warning} className="flex-row gap-2">
            <FilledIcon name="bell" size={15} tone={proposal.destructive ? "danger" : "muted"} />
            <Text className="flex-1 text-[13px]" style={{ color: proposal.destructive ? colors.danger : colors.muted }}>
              {warning}
            </Text>
          </View>
        ))}
        {!!error && <Text className="text-[13px] text-danger">{error}</Text>}
        {!pending && result && result.status !== "completed" && result.status !== "cancelled" && (
          <Text className="text-[13px] text-danger">
            {t(`localAI.proposal.results.${result.status}`, { name: proposal.entityName })}
          </Text>
        )}
      </View>

      {(pending || status === "executing") ? (
        <View className="flex-row items-center gap-2 px-4 pb-4 pt-3">
          {proposal.editableFields.length > 0 && !editing && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => setEditing(true)}
              className="flex-row items-center gap-1.5 rounded-full border border-border px-3.5 py-2.5"
            >
              <FilledIcon name="pencil" size={16} />
              <Text className="text-[14px] text-foreground">{t("localAI.proposal.edit")}</Text>
            </Pressable>
          )}
          <View className="flex-1" />
          <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} className="rounded-full border border-border px-4 py-2.5">
            <Text className="text-[14px] text-foreground">{t("localAI.proposal.cancel")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityHint={t("localAI.proposal.confirmHint")}
            disabled={busy || editing}
            onPress={confirm}
            className="min-w-24 flex-row items-center justify-center gap-1.5 rounded-full px-4 py-2.5"
            style={{ backgroundColor: tint, opacity: editing ? 0.5 : 1 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text className="font-manrope-bold text-[14px]" style={{ color: colors.background }}>
                {t(`localAI.proposal.confirm.${proposal.operation}`)}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View className="h-4" />
      )}
    </View>
  );
}
