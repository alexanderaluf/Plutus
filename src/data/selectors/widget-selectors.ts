import { getProfileColor, getProfileInitials } from "@/features/profile/lib/profile-utils";
import { i18n } from "@/localization/i18n";
import { formatCurrency, formatSignedCurrency } from "@/shared/lib/currency";
import type { AccentColorId, AppLanguage, BackupDocument, ThemeMode } from "../model/backup-document";
import type { JsonObject, JsonValue } from "../model/json";
import { selectAccounts, selectHomeOverview, type HomeMoney } from "./document-selectors";

export type WidgetAccountItem = {
  id: string;
  name: string;
  balanceFormatted: string;
  color: string;
  isPositive: boolean;
};

export type WidgetProfileSnapshot = {
  id: string;
  name: string;
  initials: string;
  color: string;
  currencyCode: string;
  accountCount: number;
  accountCountLabel: string;
  monthLabel: string;
  balanceFormatted: string;
  assetsFormatted: string;
  debtFormatted: string;
  monthlyIncomeFormatted: string;
  monthlyExpenseFormatted: string;
  monthlyNetFormatted: string;
  /** 0..100 proportion of assets relative to (assets + debt) for the visual progress bar. */
  assetsRatio: number;
  /** 0..100 proportion of monthly income relative to (income + expense). */
  cashflowRatio: number;
  accountsSummary: string;
  topAccounts: WidgetAccountItem[];
};

export type WidgetLabels = {
  appName: string;
  title: string;
  subtitle: string;
  totalBalance: string;
  assets: string;
  debt: string;
  monthlyIncome: string;
  monthlyExpense: string;
  accountsState: string;
  createIncome: string;
  createExpense: string;
  switchProfile: string;
  noAccounts: string;
  setupTitle: string;
  setupSubtitle: string;
};

export type WidgetSnapshot = {
  version: 1;
  updatedAt: string;
  language: AppLanguage;
  isRTL: boolean;
  themeMode: ThemeMode;
  accentColor: AccentColorId;
  amountsHidden: boolean;
  selectedProfileId: string | null;
  labels: WidgetLabels;
  profiles: WidgetProfileSnapshot[];
};

function text(value: JsonValue | undefined, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function normalizeCurrency(value: JsonValue | undefined) {
  const candidate = text(value, "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(candidate) ? candidate : "USD";
}

function formatMoneyValue(
  money: HomeMoney,
  hidden: boolean,
  signMode: "auto" | "plus" | "minus" | "unsigned" = "auto",
) {
  if (hidden) return "••••••";
  const prefix = money.rateDate || money.unconverted.length > 0 ? "≈ " : "";
  const absFormatted = formatCurrency(Math.abs(money.amount), money.currencyCode);
  if (signMode === "plus") {
    return `${prefix}+${absFormatted}`;
  }
  if (signMode === "minus") {
    return `${prefix}-${absFormatted}`;
  }
  if (signMode === "unsigned") {
    return `${prefix}${absFormatted}`;
  }
  const formatted =
    money.amount < 0
      ? formatSignedCurrency(money.amount, money.currencyCode)
      : formatCurrency(money.amount, money.currencyCode);
  return `${prefix}${formatted}`;
}

function clampRatio(numerator: number, denominator: number, emptyFallback: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return emptyFallback;
  }
  return Math.max(6, Math.min(100, Math.round((Math.max(0, numerator) / denominator) * 100)));
}

function resolveSelectedProfileId(document: BackupDocument, profileIds: string[]) {
  if (profileIds.length === 0) return null;
  const localSelected = document._local.selectedProfileId;
  if (localSelected && profileIds.includes(localSelected)) {
    return localSelected;
  }
  const recordSelected = document.users.find((record) => record.isSelected === true);
  const recordSelectedId = recordSelected
    ? text(recordSelected.uuid, String(recordSelected.id ?? ""))
    : "";
  if (recordSelectedId && profileIds.includes(recordSelectedId)) {
    return recordSelectedId;
  }
  return profileIds[0];
}

function buildProfileSnapshot(
  document: BackupDocument,
  userRecord: JsonObject,
  index: number,
  now: Date,
  language: string,
  hidden: boolean,
): WidgetProfileSnapshot {
  const id = text(userRecord.uuid, String(userRecord.id ?? `profile-${index + 1}`));
  const name = text(userRecord.name, `Profile ${index + 1}`);
  const initials = text(userRecord.initials, getProfileInitials(name)) || "P";
  const color = /^#[a-f\d]{6}$/i.test(text(userRecord.color))
    ? text(userRecord.color)
    : getProfileColor(index);
  const currencyCode = normalizeCurrency(userRecord.currency);

  const profileDocument: BackupDocument = {
    ...document,
    _local: {
      ...document._local,
      selectedProfileId: id,
    },
  };

  const overview = selectHomeOverview(profileDocument, currencyCode, now);
  const accounts = selectAccounts(profileDocument, now).filter(
    (account) => !account.isExcluded,
  );

  const topAccounts: WidgetAccountItem[] = [...accounts]
    .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance))
    .slice(0, 3)
    .map((account) => ({
      id: account.id,
      name: account.name,
      balanceFormatted: hidden
        ? "••••"
        : account.balance < 0
          ? formatSignedCurrency(account.balance, account.currencyCode)
          : formatCurrency(account.balance, account.currencyCode),
      color: account.color,
      isPositive: account.balance >= 0,
    }));

  const accountsSummary =
    topAccounts.length > 0
      ? topAccounts
          .slice(0, 2)
          .map((item) => `${item.name}: ${item.balanceFormatted}`)
          .join("  ·  ")
      : i18n.t("widgets.overview.noAccounts");

  const assetsTotal = Math.max(0, overview.assets.amount);
  const debtTotal = Math.max(0, overview.debt.amount);
  const assetsRatio =
    assetsTotal === 0 && debtTotal === 0
      ? 100
      : clampRatio(assetsTotal, assetsTotal + debtTotal, 100);

  const incomeTotal = Math.max(0, overview.income.amount);
  const expenseTotal = Math.max(0, overview.expense.amount);
  const cashflowRatio =
    incomeTotal === 0 && expenseTotal === 0
      ? 50
      : clampRatio(incomeTotal, incomeTotal + expenseTotal, 50);

  const monthLabel = now.toLocaleDateString(language, {
    month: "short",
    year: "numeric",
  });

  return {
    id,
    name,
    initials,
    color,
    currencyCode,
    accountCount: overview.accountCount,
    accountCountLabel: i18n.t("home.overview.includedAccounts", {
      count: overview.accountCount,
    }),
    monthLabel,
    balanceFormatted: formatMoneyValue(overview.balance, hidden, "auto"),
    assetsFormatted: formatMoneyValue(overview.assets, hidden, "unsigned"),
    debtFormatted: formatMoneyValue(overview.debt, hidden, "unsigned"),
    monthlyIncomeFormatted: formatMoneyValue(overview.income, hidden, "plus"),
    monthlyExpenseFormatted: formatMoneyValue(overview.expense, hidden, "minus"),
    monthlyNetFormatted: formatMoneyValue(overview.net, hidden, "auto"),
    assetsRatio,
    cashflowRatio,
    accountsSummary,
    topAccounts,
  };
}

/**
 * Projects the canonical BackupDocument into a read-only widget snapshot for
 * all user profiles so iOS WidgetKit and Android AppWidgetProvider can render
 * and switch profiles immediately on the home screen.
 */
export function selectWidgetSnapshot(
  document: BackupDocument,
  now = new Date(),
): WidgetSnapshot {
  const language = document._local.appLanguage ?? "en";
  const hidden = document._local.amountsHidden === true;

  const profiles = document.users.map((record, index) =>
    buildProfileSnapshot(document, record, index, now, language, hidden),
  );
  const profileIds = profiles.map((profile) => profile.id);
  const selectedProfileId = resolveSelectedProfileId(document, profileIds);

  return {
    version: 1,
    updatedAt: now.toISOString(),
    language,
    isRTL: language === "he",
    themeMode: document._local.themeMode ?? "system",
    accentColor: document._local.accentColor ?? "cyan",
    amountsHidden: hidden,
    selectedProfileId,
    labels: {
      appName: "Plutus",
      title: i18n.t("widgets.overview.title"),
      subtitle: i18n.t("widgets.overview.subtitle"),
      totalBalance: i18n.t("widgets.overview.totalBalance"),
      assets: i18n.t("widgets.overview.assets"),
      debt: i18n.t("widgets.overview.debt"),
      monthlyIncome: i18n.t("widgets.overview.monthlyIncome"),
      monthlyExpense: i18n.t("widgets.overview.monthlyExpense"),
      accountsState: i18n.t("widgets.overview.accountsState"),
      createIncome: i18n.t("widgets.overview.createIncome"),
      createExpense: i18n.t("widgets.overview.createExpense"),
      switchProfile: i18n.t("widgets.overview.switchProfile"),
      noAccounts: i18n.t("widgets.overview.noAccounts"),
      setupTitle: i18n.t("widgets.overview.setupTitle"),
      setupSubtitle: i18n.t("widgets.overview.setupSubtitle"),
    },
    profiles,
  };
}

