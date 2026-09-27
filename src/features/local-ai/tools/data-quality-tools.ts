import { identity } from "@/data/model/category-record";
import { selectExchangeRates } from "@/data/selectors/exchange-rate-selectors";

import { duplicateCandidates, orphanReferences } from "./transaction-tools";
import {
  DAY_MS,
  finite,
  parseDate,
  startOfDay,
  text,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

export type QualityIssue = {
  code: string;
  severity: "info" | "warning" | "critical";
  count: number;
  detail: string;
  ids: string[];
};

/** Deterministic checks shared by the audit tool and the priorities engine. */
export function qualityIssues(context: ToolContext): QualityIssue[] {
  return context.memo("qualityIssues", () => {
    const issues: QualityIssue[] = [];
    const add = (issue: QualityIssue) => {
      if (issue.count > 0) issues.push(issue);
    };
    const categories = context.lookup("categories");
    const uncategorized = context.search.facts.filter(
      (fact) => fact.type !== "transfer" && (!fact.category || !categories.get(fact.category)),
    );
    add({
      code: "UNCATEGORIZED",
      severity: uncategorized.length > context.search.facts.length * 0.1 ? "warning" : "info",
      count: uncategorized.length,
      detail: `${uncategorized.length} transactions without a valid category`,
      ids: uncategorized.slice(0, 20).map((fact) => fact.entry.id),
    });
    const orphans = orphanReferences(context);
    add({
      code: "MISSING_ACCOUNT",
      severity: "warning",
      count: orphans.missingAccount,
      detail: `${orphans.missingAccount} transactions reference a deleted or unknown account`,
      ids: orphans.ids.slice(0, 20),
    });
    add({
      code: "MISSING_CATEGORY",
      severity: "info",
      count: orphans.missingCategory,
      detail: `${orphans.missingCategory} transactions reference a deleted category`,
      ids: orphans.ids.slice(0, 20),
    });
    const malformed = context.records("transactions").filter((record) => {
      const amount = finite(record.amount);
      const date = Date.parse(text(record.date, text(record.createdAt)));
      return amount === null || !Number.isFinite(date);
    });
    add({
      code: "MALFORMED_RECORD",
      severity: "warning",
      count: malformed.length,
      detail: `${malformed.length} transactions have an invalid amount or date`,
      ids: malformed.slice(0, 20).map(identity),
    });
    const { pairs } = duplicateCandidates(context, { period: "last_90_days" });
    add({
      code: "DUPLICATE_CANDIDATES",
      severity: "info",
      count: pairs.length,
      detail: `${pairs.length} possible duplicate pairs in the last 90 days`,
      ids: pairs.slice(0, 10).flatMap((pair) => [pair.a.entry.id, pair.b.entry.id]),
    });
    const foreign = new Set(
      context.accountsView().map((account) => account.currencyCode).filter((code) => code !== context.currency),
    );
    const missingRates = [...foreign].filter((code) => context.rate(code) === null);
    add({
      code: "MISSING_EXCHANGE_RATE",
      severity: "warning",
      count: missingRates.length,
      detail: `no saved rate for ${missingRates.join(", ")} to ${context.currency}; totals exclude those balances`,
      ids: [],
    });
    const snapshot = selectExchangeRates(context.document, context.currency);
    if (foreign.size && snapshot && Date.parse(snapshot.date) < context.now.getTime() - 14 * DAY_MS)
      add({
        code: "STALE_EXCHANGE_RATE",
        severity: "info",
        count: 1,
        detail: `saved exchange rates are from ${snapshot.date}`,
        ids: [],
      });
    const cards = context.accountsView().filter((account) => account.kind === "credit");
    const brokenCards = cards.filter(
      (card) => !card.linkedBankAccountId || !context.accountsView().some((account) => account.id === card.linkedBankAccountId),
    );
    add({
      code: "CARD_WITHOUT_BANK",
      severity: "warning",
      count: brokenCards.length,
      detail: `${brokenCards.length} cards have no valid linked bank, so automatic payments cannot run`,
      ids: brokenCards.map((card) => card.id),
    });
    const today = startOfDay(context.now).getTime();
    const pastGoals = context.records("goals").filter((goal) => {
      const date = parseDate(goal.targetDate);
      const target = finite(goal.targetAmount);
      const current = finite(goal.currentAmount) ?? 0;
      return !!date && date.getTime() < today && target !== null && current < target;
    });
    add({
      code: "GOAL_DATE_PASSED",
      severity: "info",
      count: pastGoals.length,
      detail: `${pastGoals.length} goals are past their target date but not reached`,
      ids: pastGoals.map(identity),
    });
    const attachmentIds = new Set(context.document._local.attachments.map((item) => item.id));
    const missingReceipts = context
      .records("transactions")
      .filter(
        (record) =>
          typeof record.receiptAttachmentId === "string" &&
          record.receiptAttachmentId &&
          !attachmentIds.has(record.receiptAttachmentId),
      );
    add({
      code: "RECEIPT_WITHOUT_MANIFEST",
      severity: "info",
      count: missingReceipts.length,
      detail: `${missingReceipts.length} receipts reference an attachment that is not registered`,
      ids: missingReceipts.slice(0, 20).map(identity),
    });
    return issues;
  });
}

export function dataQualityAudit(context: ToolContext): ToolOutput {
  const output = new ToolOutput("data_quality_audit", context);
  const issues = qualityIssues(context);
  output.fact("issueCount", issues.length);
  output.line(`[data_quality_audit] ${issues.length ? `${issues.length} issue types` : "no issues found"}`);
  for (const issue of issues) {
    output.line(`- ${issue.severity} ${issue.code}: ${issue.detail}`);
    if (issue.code === "UNCATEGORIZED" || issue.code === "DUPLICATE_CANDIDATES")
      for (const id of issue.ids.slice(0, 2)) output.card({ kind: "transaction", id });
  }
  return output;
}

export function coverage(context: ToolContext) {
  return context.memo("coverage", () => {
    const facts = context.search.facts;
    const oldest = facts.length ? facts[facts.length - 1].entry.timestamp : null;
    const months = oldest ? Math.max(0, (context.now.getTime() - oldest) / (30.44 * DAY_MS)) : 0;
    const completed = context.completedMonths(12);
    const incomeMonths = completed.filter((month) => month.income > 0).length;
    return {
      transactions: facts.length,
      oldest,
      months,
      completedMonths: completed.length,
      incomeMonths,
      currentMonth: facts.some((fact) => fact.entry.timestamp >= context.monthlyTotals(1)[0].start.getTime()),
      comparison: completed.length >= 1,
      trend3: completed.length >= 3,
      trend6: completed.length >= 6,
      trend12: completed.length >= 12,
      stableIncome: incomeMonths >= 3,
      stableExpenses: completed.length >= 3,
      subscriptionDetection: months >= 3,
    };
  });
}

export function analysisCoverage(context: ToolContext): ToolOutput {
  const output = new ToolOutput("analysis_coverage", context);
  const value = coverage(context);
  const yes = (flag: boolean) => (flag ? "yes" : "no");
  output.fact("completedMonths", value.completedMonths);
  output.line(
    `[analysis_coverage] ${value.transactions} transactions${value.oldest ? ` since ${new Date(value.oldest).toISOString().slice(0, 10)} (${value.months.toFixed(1)} months)` : ""}; ${value.completedMonths} completed months with activity, ${value.incomeMonths} with income`,
    `reliable: current month ${yes(value.currentMonth)}, month comparison ${yes(value.comparison)}, 3-month trend ${yes(value.trend3)}, 6-month trend ${yes(value.trend6)}, 12-month trend ${yes(value.trend12)}, stable income estimate ${yes(value.stableIncome)}, stable expense baseline ${yes(value.stableExpenses)}, subscription detection ${yes(value.subscriptionDetection)}`,
  );
  if (!value.trend3) output.warn("less than 3 months of history; avoid firm trend conclusions");
  return output;
}
