import type { BackupDocument } from "@/data/model/backup-document";
import {
  categoryParent,
  categoryProfileId,
  createProfileMatcher,
  identity,
} from "@/data/model/category-record";
import { financialMonth } from "@/data/model/financial-month";
import type { JsonObject, JsonValue } from "@/data/model/json";
import { profileCurrency } from "@/data/model/transaction-conversion";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import { selectAccounts } from "@/data/selectors/document-selectors";
import { selectExchangeQuote } from "@/data/selectors/exchange-rate-selectors";
import {
  selectRecurringEvents,
  selectRecurrings,
} from "@/data/selectors/recurring-selectors";
import {
  createSearchContext,
  normalizeSearchText,
  type SearchContext,
} from "@/data/selectors/search-selectors";
import { createRecordLookup } from "@/data/selectors/transaction-selectors";

import {
  isoDay,
  resolvePeriod,
  type ChatToolArgs,
  type DateRange,
} from "../chat-tool-protocol";
import type { EvidenceFact, EvidenceValue, FactRef } from "../evidence";

export type ChatCard =
  | { kind: "transaction"; id: string }
  | { kind: "account"; id: string }
  | { kind: "budget"; id: string }
  | { kind: "recurring"; id: string }
  | { kind: "goal"; id: string }
  | { kind: "loan"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "category"; id: string }
  | { kind: "financial_priority"; id: string }
  | { kind: "change_proposal"; proposalId: string };

export type Fact = SearchContext["facts"][number];

/** One letter per record kind keeps mention references short: A1, T3, B2… */
export const MENTION_PREFIX: Record<Exclude<ChatCard["kind"], "change_proposal">, string> = {
  account: "A",
  transaction: "T",
  budget: "B",
  recurring: "R",
  goal: "G",
  loan: "L",
  asset: "S",
  category: "C",
  financial_priority: "P",
};

export const MENTION_KIND_NAMES: Record<Exclude<ChatCard["kind"], "change_proposal">, string> = {
  account: "account",
  transaction: "transaction",
  budget: "budget",
  recurring: "recurring payment",
  goal: "goal",
  loan: "loan",
  asset: "asset",
  category: "category",
  financial_priority: "priority",
};

export const MAX_CARDS = 6;
export const DAY_MS = 86_400_000;
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function text(value: JsonValue | undefined, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

export function finite(value: JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Numbers stored as strings in imported/legacy records. */
export function numeric(value: JsonValue | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Plain numbers keep tokens low; the model formats them for the reader. */
export function money(amount: number, currency: string) {
  return `${round2(amount).toFixed(2)} ${currency}`;
}

export function percent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function startOfDay(date: Date, offset = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

export function parseDate(value: JsonValue | undefined): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(
        Number(value.slice(0, 4)),
        Number(value.slice(5, 7)) - 1,
        Number(value.slice(8, 10)),
      )
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Yearly occurrence counts for recurring periods. */
export const PERIODS_PER_YEAR: Record<string, number> = {
  Daily: 365,
  Weekly: 52,
  Fortnightly: 26,
  Monthly: 12,
  Quarterly: 4,
  Biannually: 2,
  Yearly: 1,
};

export type ProfileRecordKey =
  | "accounts"
  | "categories"
  | "budgets"
  | "recurrings"
  | "goals"
  | "loans"
  | "assets"
  | "labels"
  | "places"
  | "peoples"
  | "templates"
  | "billSplitters"
  | "transactions";

export type EntityMatch = {
  record: JsonObject | null;
  candidates: JsonObject[];
};

export type MonthTotals = {
  key: string;
  start: Date;
  end: Date;
  income: number;
  expense: number;
  net: number;
  /** True for the current, still running month. */
  partial: boolean;
};

/**
 * Everything a tool needs is resolved once per question so several tools can
 * share one pass over the document. Nothing here writes.
 */
export class ToolContext {
  readonly currency: string;
  readonly monthStartDay: number;
  readonly profileId: string;
  readonly search: SearchContext;
  readonly excludedAccounts: Set<string>;
  readonly owned: (record: JsonObject) => boolean;
  readonly reporting: string;
  readonly generatedAt: string;
  private readonly lookups = new Map<string, ReturnType<typeof createRecordLookup>>();
  private readonly rates = new Map<string, number | null>();
  private cache = new Map<string, unknown>();
  private readonly mentionKeys = new Map<string, string>();
  private readonly mentionCounters = new Map<string, number>();
  /** Short references (e.g. "A1") the model can write to show a record inline. */
  readonly mentions = new Map<string, { card: ChatCard; label: string }>();

  constructor(
    readonly document: BackupDocument,
    readonly now: Date,
  ) {
    this.profileId = String(
      categoryProfileId(document) ?? document._local.selectedProfileId ?? "",
    );
    this.currency = profileCurrency(document, this.profileId);
    this.monthStartDay = document._local.monthStartDay;
    this.search = createSearchContext(document, this.currency);
    this.owned = createProfileMatcher(document);
    this.generatedAt = now.toISOString();
    this.excludedAccounts = new Set(
      document.accounts
        .filter((account) => account.isExcluded === true)
        .map(identity),
    );
    // Single-currency aggregates use the profile currency unless no record
    // converts into it; then the most common record currency is clearer.
    const counts = new Map<string, number>();
    for (const fact of this.search.facts)
      counts.set(fact.reportingCurrency, (counts.get(fact.reportingCurrency) ?? 0) + 1);
    this.reporting = counts.has(this.currency) || !counts.size
      ? this.currency
      : [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }

  memo<T>(key: string, build: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key) as T;
  }

  /**
   * Registers a record the answer may show and returns its short reference.
   * The model only ever sees these references, never storage ids.
   */
  mention(card: ChatCard): string | null {
    if (card.kind === "change_proposal") return null;
    const key = `${card.kind}:${card.id}`;
    const existing = this.mentionKeys.get(key);
    if (existing) return existing;
    const prefix = MENTION_PREFIX[card.kind];
    const count = (this.mentionCounters.get(prefix) ?? 0) + 1;
    this.mentionCounters.set(prefix, count);
    const ref = `${prefix}${count}`;
    this.mentionKeys.set(key, ref);
    this.mentions.set(ref, { card, label: this.mentionLabel(card) });
    return ref;
  }

  private mentionLabel(card: Exclude<ChatCard, { kind: "change_proposal" }>) {
    switch (card.kind) {
      case "transaction": {
        const fact = this.search.facts.find((item) => item.entry.id === card.id);
        return fact
          ? `${this.merchant(fact)} ${isoDay(new Date(fact.entry.timestamp))} ${money(fact.amount, fact.currencyCode)}`
          : "transaction";
      }
      case "account":
        return this.name("accounts", card.id, "account");
      case "budget":
        return this.name("budgets", card.id, "budget");
      case "category":
        return this.name("categories", card.id, "category");
      case "loan":
        return this.name("loans", card.id, "loan");
      case "recurring":
        return text(this.lookup("recurrings").get(card.id)?.name, "recurring payment");
      case "goal":
        return text(this.lookup("goals").get(card.id)?.name, "goal");
      case "asset":
        return text(this.lookup("assets").get(card.id)?.name, "asset");
      case "financial_priority":
        return card.id.split(":")[0].replace(/_/g, " ");
    }
  }

  lookup(key: ProfileRecordKey | "users") {
    let found = this.lookups.get(key);
    if (!found) {
      found = createRecordLookup(this.document[key]);
      this.lookups.set(key, found);
    }
    return found;
  }

  name(
    kind: "categories" | "accounts" | "labels" | "places" | "people" | "budgets" | "loans",
    id: string,
    fallback: string,
  ) {
    const key = kind === "people" ? "peoples" : kind;
    return id ? text(this.lookup(key).get(id)?.name, fallback) : fallback;
  }

  categoryName(fact: Fact) {
    return text(
      fact.entry.record.categoryName,
      this.name("categories", fact.category, "Uncategorized"),
    );
  }

  merchant(fact: Fact) {
    return text(fact.entry.record.name, "Untitled").slice(0, 60);
  }

  /** Records of a collection that belong to the active profile. */
  records(key: ProfileRecordKey) {
    return this.memo(`records:${key}`, () =>
      this.document[key].filter((record) => this.owned(record)),
    );
  }

  /**
   * Finds a record by id, exact name, then partial name. Several partial
   * matches are returned as candidates so the model can ask which one.
   */
  findEntity(key: ProfileRecordKey, reference: string | undefined): EntityMatch {
    if (!reference?.trim()) return { record: null, candidates: [] };
    const records = this.records(key);
    const byId = records.find((record) =>
      [record.uuid, record.id].some(
        (value) => value != null && String(value) === reference,
      ),
    );
    if (byId) return { record: byId, candidates: [] };
    const wanted = normalizeSearchText(reference);
    const label = (record: JsonObject) =>
      normalizeSearchText(
        text(record.name, text(record.title, text(record.description))),
      );
    const exact = records.filter((record) => label(record) === wanted);
    if (exact.length === 1) return { record: exact[0], candidates: [] };
    if (exact.length > 1) return { record: null, candidates: exact };
    const partial = records.filter((record) => {
      const name = label(record);
      return !!name && (name.includes(wanted) || wanted.includes(name));
    });
    return partial.length === 1
      ? { record: partial[0], candidates: [] }
      : { record: null, candidates: partial };
  }

  /** Latest saved quote into the profile currency, direct or inverse. */
  rate(code: string) {
    return this.rateBetween(code, this.currency);
  }

  rateBetween(from: string, to: string) {
    const source = from.toUpperCase();
    const target = to.toUpperCase();
    if (source === target) return 1;
    const key = `${source}>${target}`;
    if (!this.rates.has(key)) {
      const direct = selectExchangeQuote(this.document, source, target, this.now);
      const inverse = direct
        ? null
        : selectExchangeQuote(this.document, target, source, this.now);
      this.rates.set(
        key,
        direct?.rate ?? (inverse?.rate ? 1 / inverse.rate : null),
      );
    }
    return this.rates.get(key) ?? null;
  }

  /** Converts with saved rates only; null when no rate is stored. */
  convert(amount: number, from: string, to = this.currency) {
    const rate = this.rateBetween(from, to);
    return rate === null ? null : amount * rate;
  }

  /** Salary-like anchors so "since payday" is resolved by code, not the model. */
  private anchors() {
    return this.memo("anchors", () => {
      const incomes = this.search.facts.filter(
        (fact) =>
          fact.type === "income" &&
          this.counted(fact) &&
          fact.entry.timestamp <= this.now.getTime(),
      );
      const typical = median(incomes.map((fact) => fact.reportingAmount));
      const salary = incomes.find((fact) => fact.reportingAmount >= typical);
      const nextIncome = this.upcomingEvents(62).find((event) => event.type === 1);
      return {
        lastPayday: salary ? new Date(salary.entry.timestamp) : null,
        nextPayday: nextIncome?.date ?? null,
      };
    });
  }

  range(args: ChatToolArgs, fallback: string | null): DateRange | null {
    const anchors = /payday/.test(args.period ?? "") ? this.anchors() : {};
    return (
      resolvePeriod(args, this.now, this.monthStartDay, anchors) ??
      (fallback
        ? resolvePeriod({ period: fallback }, this.now, this.monthStartDay, anchors)
        : null)
    );
  }

  /** Facts in the half-open range; the search index is newest first. */
  facts(range: Pick<DateRange, "start" | "end"> | null) {
    if (!range) return this.search.facts;
    const start = range.start.getTime();
    const end = range.end.getTime();
    return this.search.facts.filter(
      (fact) => fact.entry.timestamp >= start && fact.entry.timestamp < end,
    );
  }

  /** Reports ignore transfers and excluded accounts, like the app's screens. */
  counted(fact: Fact) {
    return (
      fact.type !== "transfer" &&
      !fact.accounts.some((id) => this.excludedAccounts.has(id))
    );
  }

  /** Card settlements are generated by the app, not entered by the user. */
  isCardPayment(fact: Fact) {
    return (
      typeof fact.entry.record.cardPaymentPeriod === "string" ||
      /^card-payment:/.test(fact.entry.id)
    );
  }

  matches(fact: Fact, args: ChatToolArgs) {
    const type = args.type ?? "all";
    if (type !== "all" && fact.type !== type) return false;
    const relation = (
      wanted: string | undefined,
      ids: string[],
      kind: "accounts" | "labels" | "places" | "people" | "budgets" | "loans",
    ) => {
      if (!wanted) return true;
      const needle = normalizeSearchText(wanted);
      return ids.some(
        (id) =>
          id === wanted ||
          normalizeSearchText(this.name(kind, id, "")).includes(needle),
      );
    };
    if (args.category) {
      const wanted = normalizeSearchText(args.category);
      const names = [
        text(fact.entry.record.categoryName),
        ...fact.categoryPath.map((id) => this.name("categories", id, "")),
      ].map(normalizeSearchText);
      if (
        !fact.categoryPath.includes(args.category) &&
        !names.some((name) => name && name.includes(wanted))
      )
        return false;
    }
    if (!relation(args.account, fact.accounts, "accounts")) return false;
    if (!relation(args.label, fact.labels, "labels")) return false;
    if (!relation(args.place, fact.place ? [fact.place] : [], "places")) return false;
    if (!relation(args.person, fact.person ? [fact.person] : [], "people")) return false;
    if (!relation(args.budget, fact.budget ? [fact.budget] : [], "budgets")) return false;
    if (args.loan) {
      const loan = text(fact.entry.record.loan);
      if (!relation(args.loan, loan ? [loan] : [], "loans")) return false;
    }
    if (args.currency && fact.currencyCode !== args.currency) return false;
    if (args.hasReceipt !== undefined && fact.hasReceipt !== args.hasReceipt)
      return false;
    if (args.merchant) {
      const wanted = normalizeSearchText(args.merchant);
      if (!normalizeSearchText(this.merchant(fact)).includes(wanted)) return false;
    }
    if (args.minAmount !== undefined && fact.reportingAmount < args.minAmount)
      return false;
    if (args.maxAmount !== undefined && fact.reportingAmount > args.maxAmount)
      return false;
    if (args.query) {
      const tokens = normalizeSearchText(args.query).split(/\s+/).filter(Boolean);
      if (!tokens.every((token) => fact.haystack.includes(token))) return false;
    }
    return true;
  }

  line(fact: Fact) {
    const record = fact.entry.record;
    const date = Number.isFinite(fact.entry.timestamp)
      ? isoDay(new Date(fact.entry.timestamp))
      : "unknown date";
    const converted =
      fact.currencyCode !== fact.reportingCurrency
        ? ` (= ${money(fact.reportingAmount, fact.reportingCurrency)})`
        : "";
    const account = this.name("accounts", fact.accounts[0] ?? "", "");
    const note = text(record.description).slice(0, 40);
    return [
      date,
      fact.type,
      `${money(fact.amount, fact.currencyCode)}${converted}`,
      this.merchant(fact),
      this.categoryName(fact),
      account,
      note,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  accountsView() {
    return this.memo("accounts", () => selectAccounts(this.document, this.now));
  }

  budgetsView() {
    return this.memo("budgets", () => selectBudgets(this.document, this.now));
  }

  recurringsView() {
    return this.memo("recurrings", () => selectRecurrings(this.document, this.now));
  }

  activeRecurrings() {
    return this.recurringsView().filter((item) => !item.archived && item.valid);
  }

  upcomingEvents(days: number) {
    return this.memo(`events:${days}`, () => {
      const today = startOfDay(this.now);
      return selectRecurringEvents(
        this.activeRecurrings(),
        today,
        startOfDay(this.now, days),
      ).filter((event) => event.status === "pending");
    });
  }

  /**
   * Income and expense for each of the last `count` financial months, in the
   * reporting currency, oldest first. The last entry is the running month.
   */
  monthlyTotals(count: number): MonthTotals[] {
    return this.memo(`months:${count}`, () => {
      const months: MonthTotals[] = [];
      for (let offset = count - 1; offset >= 0; offset--) {
        const { start, end } = financialMonth(this.now, this.monthStartDay, -offset);
        let income = 0;
        let expense = 0;
        for (const fact of this.facts({ start, end })) {
          if (!this.counted(fact) || fact.reportingCurrency !== this.reporting)
            continue;
          if (fact.type === "income") income += fact.reportingAmount;
          else expense += fact.reportingAmount;
        }
        months.push({
          key: isoDay(start).slice(0, 7),
          start,
          end,
          income,
          expense,
          net: income - expense,
          partial: offset === 0,
        });
      }
      return months;
    });
  }

  /** Completed months with any activity; the running month is excluded. */
  completedMonths(count: number) {
    return this.monthlyTotals(count + 1)
      .filter((month) => !month.partial)
      .filter((month) => month.income || month.expense);
  }

  /** Cash-like, savings and card positions converted to the profile currency. */
  liquidity() {
    return this.memo("liquidity", () => {
      let liquid = 0;
      let accessibleSavings = 0;
      let restrictedSavings = 0;
      let cardDebt = 0;
      const unconverted = new Set<string>();
      const rows: {
        id: string;
        name: string;
        kind: string;
        balance: number;
        currency: string;
        converted: number | null;
        bucket: "liquid" | "accessible_savings" | "restricted_savings" | "card_debt" | "overdraft";
      }[] = [];
      for (const account of this.accountsView()) {
        if (account.isExcluded) continue;
        const converted = this.convert(account.balance, account.currencyCode);
        if (converted === null) unconverted.add(account.currencyCode);
        const record = this.lookup("accounts").get(account.id);
        const details = record?.savingsDetails;
        const liquidity =
          details && typeof details === "object" && !Array.isArray(details)
            ? text(details.liquidity, "flexible")
            : "flexible";
        const bucket =
          account.kind === "credit"
            ? ("card_debt" as const)
            : account.kind === "savings"
              ? liquidity === "flexible"
                ? ("accessible_savings" as const)
                : ("restricted_savings" as const)
              : account.balance < 0
                ? ("overdraft" as const)
                : ("liquid" as const);
        rows.push({
          id: account.id,
          name: account.name,
          kind: account.kind,
          balance: account.balance,
          currency: account.currencyCode,
          converted,
          bucket,
        });
        if (converted === null) continue;
        if (bucket === "card_debt") cardDebt += Math.max(0, -converted);
        else if (bucket === "accessible_savings") accessibleSavings += converted;
        else if (bucket === "restricted_savings") restrictedSavings += converted;
        else liquid += converted;
      }
      return {
        liquid,
        accessibleSavings,
        restrictedSavings,
        cardDebt,
        unconverted: [...unconverted],
        rows,
      };
    });
  }

  /** Normalized monthly recurring commitments in the profile currency. */
  recurringMonthly() {
    return this.memo("recurringMonthly", () => {
      let expense = 0;
      let income = 0;
      const unconverted = new Set<string>();
      for (const item of this.activeRecurrings()) {
        const monthly = (item.amount * (PERIODS_PER_YEAR[item.period] ?? 0)) / 12;
        const converted = this.convert(monthly, item.currencyCode);
        if (converted === null) {
          unconverted.add(item.currencyCode);
          continue;
        }
        if (item.type === 1) income += converted;
        else expense += converted;
      }
      return { expense, income, unconverted: [...unconverted] };
    });
  }

  categoryChildren() {
    return this.memo("categoryChildren", () => {
      const children = new Map<string, string[]>();
      for (const category of this.records("categories")) {
        const parent = categoryParent(category);
        if (parent == null) continue;
        const parentRecord = this.lookup("categories").get(String(parent));
        if (!parentRecord) continue;
        const list = children.get(identity(parentRecord)) ?? [];
        list.push(identity(category));
        children.set(identity(parentRecord), list);
      }
      return children;
    });
  }
}

/** Collects lines, cards and structured evidence for one tool call. */
export class ToolOutput {
  readonly lines: string[] = [];
  readonly cards: ChatCard[] = [];
  readonly facts: EvidenceFact[] = [];
  readonly warnings: string[] = [];
  readonly missing: string[] = [];
  readonly assumptions: string[] = [];

  constructor(
    readonly tool: string,
    private readonly context: ToolContext,
  ) {}

  line(...values: string[]) {
    this.lines.push(...values);
    return this;
  }

  card(card: ChatCard) {
    if (this.cards.length < MAX_CARDS * 2) {
      this.cards.push(card);
      this.context.mention(card);
    }
    return this;
  }

  /** Records a structured, attributable value and returns it. */
  fact<T extends EvidenceValue>(
    key: string,
    value: T,
    meta: Partial<Omit<FactRef, "factId" | "tool" | "computedAt">> & {
      range?: DateRange | null;
    } = {},
  ): T {
    const { range, ...rest } = meta;
    this.facts.push({
      ref: {
        factId: `${this.tool}.${key}`,
        tool: this.tool,
        computedAt: this.context.generatedAt,
        kind: "calculated",
        ...(range
          ? {
              period: {
                start: range.start.toISOString(),
                end: range.end.toISOString(),
                label: range.label,
              },
            }
          : {}),
        ...rest,
      },
      value,
    });
    return value;
  }

  warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
    return this;
  }

  missingData(message: string) {
    if (!this.missing.includes(message)) this.missing.push(message);
    return this;
  }

  assume(message: string) {
    if (!this.assumptions.includes(message)) this.assumptions.push(message);
    return this;
  }

  /** Adds another tool's output (used by bundle tools). */
  include(other: ToolOutput, maxLines = Infinity) {
    this.lines.push(...other.lines.slice(0, maxLines));
    for (const card of other.cards) this.card(card);
    this.facts.push(...other.facts);
    for (const warning of other.warnings) this.warn(warning);
    for (const missing of other.missing) this.missingData(missing);
    for (const assumption of other.assumptions) this.assume(assumption);
    return this;
  }
}

/** Resolves a user/model reference to one record or explains why not. */
export function resolveOne(
  context: ToolContext,
  output: ToolOutput,
  key: ProfileRecordKey,
  reference: string | undefined,
  kind: string,
) {
  const match = context.findEntity(key, reference);
  if (match.record) return match.record;
  if (!reference) {
    output.line(`no ${kind} specified`);
    output.missingData(`which ${kind}`);
  } else if (match.candidates.length) {
    output.line(
      `"${reference}" matches several ${kind}s: ${match.candidates
        .slice(0, 8)
        .map((record) => text(record.name, identity(record)))
        .join(", ")}. Ask the user which one.`,
    );
    output.missingData(`which ${kind} "${reference}" means`);
  } else {
    output.line(`no ${kind} named "${reference}"`);
    output.missingData(`${kind} "${reference}" not found`);
  }
  return null;
}
