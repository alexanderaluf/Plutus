import { identity } from "@/data/model/category-record";
import { financialMonth } from "@/data/model/financial-month";
import { selectCategories } from "@/data/selectors/category-selectors";

import { type ChatToolArgs } from "../chat-tool-protocol";
import {
  MAX_CARDS,
  money,
  percent,
  resolveOne,
  round2,
  text,
  ToolOutput,
  type Fact,
  type ToolContext,
} from "./tool-context";

export function categoriesTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("categories", context);
  const current = financialMonth(context.now, context.monthStartDay, 0);
  const previous = financialMonth(context.now, context.monthStartDay, -1);
  const totals = (range: { start: Date; end: Date }) => {
    const map = new Map<string, number>();
    for (const fact of context.facts(range)) {
      if (!context.counted(fact) || fact.reportingCurrency !== context.reporting) continue;
      for (const id of fact.categoryPath.length ? fact.categoryPath : [fact.category])
        map.set(id, (map.get(id) ?? 0) + fact.reportingAmount);
    }
    return map;
  };
  const now = totals(current);
  const before = totals(previous);
  const categories = selectCategories(context.document);
  output.line(
    `[categories] name | type | parent | this month | last month (${context.reporting}; parents include children)`,
    ...categories.map((category) => {
      const parent = category.parentId ? context.name("categories", category.parentId, "") : "";
      return `${category.name} | ${category.type === 1 ? "income" : category.type === 2 ? "transfer" : "expense"} | ${parent || "-"} | ${(now.get(category.id) ?? 0).toFixed(2)} | ${(before.get(category.id) ?? 0).toFixed(2)}`;
    }),
  );
  return output;
}

function tally(values: string[], limit = 5) {
  return [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value} (${count})`)
    .join(", ");
}

export function categoryDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("category_details", context);
  const record = resolveOne(context, output, "categories", args.id ?? args.category, "category");
  if (!record) return output;
  const id = identity(record);
  const range = context.range(args, "this_month")!;
  const previousRange =
    context.range({ period: args.period === "this_month" || !args.period ? "last_month" : undefined }, null) ??
    { start: new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime())), end: range.start, label: "previous equal period" };
  const children = context.categoryChildren().get(id) ?? [];
  const sum = (facts: Fact[]) => {
    let direct = 0;
    let rolled = 0;
    const matched: Fact[] = [];
    for (const fact of facts) {
      if (!context.counted(fact) || fact.reportingCurrency !== context.reporting) continue;
      if (!fact.categoryPath.includes(id)) continue;
      rolled += fact.reportingAmount;
      if (fact.category === id) direct += fact.reportingAmount;
      matched.push(fact);
    }
    return { direct, rolled, matched };
  };
  const now = sum(context.facts(range));
  const before = sum(context.facts(previousRange));
  output.fact("total", round2(now.rolled), { currency: context.reporting, range, entityType: "category", entityId: id });
  output.line(
    `[category_details] ${text(record.name)} (${Number(record.type ?? 0) === 1 ? "income" : Number(record.type ?? 0) === 2 ? "transfer" : "expense"})${children.length ? `; subcategories: ${children.map((child) => context.name("categories", child, "?")).join(", ")}` : ""}`,
    `${range.label}: total ${money(now.rolled, context.reporting)} (directly on this category ${money(now.direct, context.reporting)}), ${now.matched.length} transactions`,
    `previous ${previousRange.label}: ${money(before.rolled, context.reporting)}${before.rolled > 0 ? ` (change ${now.rolled >= before.rolled ? "+" : ""}${Math.round(((now.rolled - before.rolled) / before.rolled) * 100)}%)` : ""}`,
    `merchants: ${tally(now.matched.map((fact) => context.merchant(fact))) || "-"}`,
    `accounts: ${tally(now.matched.map((fact) => context.name("accounts", fact.accounts[0] ?? "", "none"))) || "-"}`,
  );
  output.card({ kind: "category", id });
  for (const fact of now.matched.slice(0, 3)) output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

function relationSummary(
  context: ToolContext,
  args: ChatToolArgs,
  tool: "labels_summary" | "places_summary" | "people_summary",
  kind: "labels" | "places" | "people",
  wanted: string | undefined,
  keyOf: (fact: Fact) => string[],
): ToolOutput {
  const output = new ToolOutput(tool, context);
  const range = context.range(args, "last_12_months")!;
  const groups = new Map<string, { expense: number; income: number; transfer: number; count: number; facts: Fact[] }>();
  for (const fact of context.facts(range)) {
    if (fact.reportingCurrency !== context.reporting) continue;
    if (fact.accounts.some((id) => context.excludedAccounts.has(id))) continue;
    for (const id of keyOf(fact)) {
      const name = context.name(kind, id, "");
      if (!name) continue;
      if (wanted && !name.toLowerCase().includes(wanted.toLowerCase()) && id !== wanted) continue;
      const bucket = groups.get(name) ?? { expense: 0, income: 0, transfer: 0, count: 0, facts: [] };
      bucket[fact.type] += fact.reportingAmount;
      bucket.count++;
      bucket.facts.push(fact);
      groups.set(name, bucket);
    }
  }
  const total = [...groups.values()].reduce((sum, bucket) => sum + bucket.expense, 0);
  output.line(
    `[${tool}] ${range.label} in ${context.reporting}${wanted ? `, matching "${wanted}"` : ""}`,
    "name | spent | received | transferred | transactions | share of spending",
  );
  const sorted = [...groups].sort((a, b) => b[1].expense + b[1].income - (a[1].expense + a[1].income));
  for (const [name, bucket] of sorted.slice(0, 12)) {
    output.fact(`spent.${name}`, round2(bucket.expense), { currency: context.reporting, range });
    output.line(
      `${name} | ${bucket.expense.toFixed(2)} | ${bucket.income.toFixed(2)} | ${bucket.transfer.toFixed(2)} | ${bucket.count} | ${percent(bucket.expense, total)}`,
    );
  }
  if (!sorted.length) output.line("no matching transactions");
  if (wanted && sorted.length === 1)
    for (const fact of sorted[0][1].facts.slice(0, MAX_CARDS))
      output.card({ kind: "transaction", id: fact.entry.id });
  return output;
}

export function labelsSummary(context: ToolContext, args: ChatToolArgs) {
  return relationSummary(context, args, "labels_summary", "labels", args.label, (fact) => fact.labels);
}

export function placesSummary(context: ToolContext, args: ChatToolArgs) {
  return relationSummary(context, args, "places_summary", "places", args.place, (fact) =>
    fact.place ? [fact.place] : [],
  );
}

/** Financial analysis needs names only; phone and email are never included. */
export function peopleSummary(context: ToolContext, args: ChatToolArgs) {
  return relationSummary(context, args, "people_summary", "people", args.person, (fact) =>
    fact.person ? [fact.person] : [],
  );
}

export function templatesTool(context: ToolContext): ToolOutput {
  const output = new ToolOutput("templates", context);
  const templates = context.records("templates");
  output.line("[templates] name | type | amount | account | category");
  for (const template of templates.slice(0, 20))
    output.line(
      `${text(template.name, "Template")} | ${template.type === 1 ? "income" : template.type === 2 ? "transfer" : "expense"} | ${money(Number(template.amount) || 0, text(template.currencyCode, context.currency))} | ${context.name("accounts", text(template.account), "-")} | ${context.name("categories", text(template.category), "-")}`,
    );
  if (!templates.length) output.line("no templates");
  return output;
}
