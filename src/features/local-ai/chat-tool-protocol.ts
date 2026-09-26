import { financialMonth } from "@/data/model/financial-month";

/**
 * Tool names the model may request. Execution happens only in trusted
 * selectors; the model never sees or produces SQL, file paths or raw records.
 */
export const CHAT_TOOL_NAMES = [
  "financial_snapshot",
  "financial_health",
  "search_transactions",
  "largest_expenses",
  "recent_transactions",
  "spending_summary",
  "cash_flow",
  "compare_periods",
  "accounts",
  "net_worth",
  "budgets",
  "recurring",
  "categories",
  "exchange_rates",
  "goals_loans_assets",
] as const;

export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

export type TransactionKind = "expense" | "income" | "transfer" | "all";
export type SummaryGroup =
  | "category"
  | "account"
  | "merchant"
  | "month"
  | "week"
  | "day"
  | "weekday"
  | "label"
  | "place"
  | "person";
export type TransactionSort = "newest" | "oldest" | "largest" | "smallest";

export type ChatToolArgs = {
  period?: string;
  from?: string;
  to?: string;
  periodB?: string;
  query?: string;
  category?: string;
  account?: string;
  type?: TransactionKind;
  groupBy?: SummaryGroup;
  sort?: TransactionSort;
  limit?: number;
  minAmount?: number;
  maxAmount?: number;
  days?: number;
};

export type ChatToolCall = { name: ChatToolName; args: ChatToolArgs };

/** One line per tool keeps the system prompt small enough for on-device context. */
export const CHAT_TOOL_GUIDE = `financial_snapshot: compact overview of ALL data (balances, monthly totals, categories, budgets, recurring, rates, recent transactions). Use when unsure or when no other tool fits.
financial_health: health score, savings rate, spending trend, month-end forecast, emergency fund, debt and credit use, and rule-based findings. Use with financial_snapshot for advice such as "how can I improve my finances".
search_transactions {query,category,account,type,period,minAmount,maxAmount,sort,limit}: find/list transactions.
largest_expenses {period,limit}: biggest expenses.
recent_transactions {limit}: newest transactions.
spending_summary {type,period,groupBy}: totals grouped by category|account|merchant|month|week|day|weekday|label|place|person.
cash_flow {period}: income, expenses, net, savings rate.
compare_periods {period,periodB,type}: compare two periods by category.
accounts: every account with balance, credit limit and cycle spending.
net_worth {period}: assets, debts and net worth now, or at the end of a period.
budgets: budgets with spent, limit and remaining.
recurring {days}: subscriptions, recurring bills/income and upcoming payments.
categories: category list with this and last month totals.
exchange_rates: saved currency rates.
goals_loans_assets: savings goals, loans and assets.
period values: today, yesterday, this_week, last_week, this_month, last_month, last_N_days, last_N_months, this_year, last_year, all, YYYY, YYYY-MM, or from/to dates YYYY-MM-DD.`;

const TYPES = new Set<TransactionKind>(["expense", "income", "transfer", "all"]);
const GROUPS = new Set<SummaryGroup>([
  "category",
  "account",
  "merchant",
  "month",
  "week",
  "day",
  "weekday",
  "label",
  "place",
  "person",
]);
const SORTS = new Set<TransactionSort>(["newest", "oldest", "largest", "smallest"]);

function readText(value: unknown, max = 80) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
}

function readNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[^\d.-]/g, ""))
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Untrusted model arguments are reduced to known keys and primitive values. */
export function sanitizeToolArgs(value: unknown): ChatToolArgs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const args: ChatToolArgs = {};
  for (const key of [
    "period",
    "from",
    "to",
    "periodB",
    "query",
    "category",
    "account",
  ] as const) {
    const text = readText(input[key]);
    if (text) args[key] = text;
  }
  const type = readText(input.type)?.toLowerCase();
  if (type && TYPES.has(type as TransactionKind))
    args.type = type as TransactionKind;
  const groupBy = readText(input.groupBy ?? input.group_by)?.toLowerCase();
  if (groupBy && GROUPS.has(groupBy as SummaryGroup))
    args.groupBy = groupBy as SummaryGroup;
  const sort = readText(input.sort)?.toLowerCase();
  if (sort && SORTS.has(sort as TransactionSort))
    args.sort = sort as TransactionSort;
  for (const key of ["limit", "minAmount", "maxAmount", "days"] as const) {
    const number = readNumber(input[key]);
    if (number !== undefined) args[key] = number;
  }
  if (args.limit !== undefined)
    args.limit = Math.max(1, Math.min(50, Math.round(args.limit)));
  if (args.days !== undefined)
    args.days = Math.max(1, Math.min(366, Math.round(args.days)));
  return args;
}

function extractJson(output: string) {
  const unfenced = output.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function isToolName(value: unknown): value is ChatToolName {
  return (
    typeof value === "string" &&
    (CHAT_TOOL_NAMES as readonly string[]).includes(value)
  );
}

/**
 * Accepts `{"tools":["accounts"]}`, `{"tools":[{"name":"cash_flow","args":{}}]}`
 * and a single `{"name":…,"args":…}`. Unknown tools are dropped. Returns null
 * when the output is not a tool request, i.e. the model answered directly.
 */
export function parseToolCalls(output: string): ChatToolCall[] | null {
  const parsed = extractJson(output);
  if (!parsed || typeof parsed !== "object") return salvageToolCalls(output);
  const record = parsed as Record<string, unknown>;
  const requested = Array.isArray(record.tools)
    ? record.tools
    : Array.isArray(record.tool_calls)
      ? record.tool_calls
      : "name" in record || "tool" in record
        ? [record]
        : null;
  if (!requested) return null;
  const calls: ChatToolCall[] = [];
  for (const item of requested.slice(0, 4)) {
    if (isToolName(item)) {
      calls.push({ name: item, args: {} });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const name = entry.name ?? entry.tool;
    if (!isToolName(name)) continue;
    calls.push({
      name,
      args: sanitizeToolArgs(entry.args ?? entry.arguments ?? entry.parameters),
    });
  }
  return calls;
}

/**
 * Small models sometimes emit almost-JSON (a missing `]`, a trailing comma).
 * Tool names and flat `args` objects are recovered individually; output that
 * looks like a tool request but names no known tool yields an empty list so it
 * is never shown to the user as an answer.
 */
function salvageToolCalls(output: string): ChatToolCall[] | null {
  if (!looksLikeToolRequest(output)) return null;
  const calls: ChatToolCall[] = [];
  const pattern =
    /"(?:name|tool)"\s*:\s*"([a-z_]+)"(?:\s*,\s*"(?:args|arguments|parameters)"\s*:\s*(\{[^{}]*\}))?/g;
  for (const match of output.matchAll(pattern)) {
    if (!isToolName(match[1]) || calls.length >= 4) continue;
    let args: unknown = {};
    try {
      args = match[2] ? JSON.parse(match[2].replace(/,\s*}/, "}")) : {};
    } catch {
      args = {};
    }
    calls.push({ name: match[1], args: sanitizeToolArgs(args) });
  }
  // A bare list such as {"tools":["accounts","budgets"
  if (!calls.length)
    for (const name of CHAT_TOOL_NAMES)
      if (new RegExp(`"${name}"`).test(output)) calls.push({ name, args: {} });
  return calls;
}

/** True when text is (or starts as) a JSON tool request rather than prose. */
export function looksLikeToolRequest(output: string) {
  const start = output.replace(/```(?:json)?/gi, "").trimStart();
  return start.startsWith("{") && /"(tools?|name|tool_calls)"\s*:/.test(start);
}

/** Removes a tool-request blob a model sometimes prefixes to a real answer. */
export function stripToolJson(answer: string) {
  const text = answer.trim();
  if (!looksLikeToolRequest(text)) return text;
  const unfenced = text.replace(/```(?:json)?/gi, "");
  let depth = 0;
  for (let index = 0; index < unfenced.length; index++) {
    const char = unfenced[index];
    if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
    if (depth <= 0 && index > 0 && char === "}")
      return unfenced.slice(index + 1).trim();
  }
  return "";
}

const ADVICE_PATTERN =
  /(improve|advice|advise|tips?\b|recommend|suggest|should i|how am i doing|how are my finances|financial health|healthy|analy[sz]e|review my|save more|saving more|cut (back|down)|reduce (my )?(spending|expenses)|get out of debt|plan|overview|summary of my|לשפר|שיפור|עצה|עצות|טיפ|המלצ|מה כדאי|איך אני עומד|מצב(י)? הכלכלי|מצב כלכלי|בריאות פיננסית|לנתח|ניתוח|לחסוך|לקצץ|להפחית|תוכנית|סיכום|улучш|совет|рекоменд|как у меня дела|финансов\S* здоров|проанализ|анализ|сэконом|сократить|план|обзор)/i;

/** Open-ended questions that need a read of most of the document. */
export function isAdviceQuestion(question: string) {
  return ADVICE_PATTERN.test(question);
}

/** Backward-compatible list form used by older tests and callers. */
export function parseReadTools(output: string): ChatToolName[] {
  return (parseToolCalls(output) ?? []).map((call) => call.name);
}

const PERIOD_PATTERNS: [RegExp, string][] = [
  [/(\btoday\b|היום|сегодня)/i, "today"],
  [/(\byesterday\b|אתמול|вчера)/i, "yesterday"],
  [/(last|previous|past) week|שבוע שעבר|прошл\S* недел/i, "last_week"],
  [/this week|השבוע|эт\S* недел/i, "this_week"],
  [/(last|previous|past) month|חודש שעבר|בחודש הקודם|прошл\S* месяц/i, "last_month"],
  [/this month|החודש|эт\S* месяц/i, "this_month"],
  [/(last|previous|past) year|שנה שעברה|прошл\S* год/i, "last_year"],
  [/this year|השנה|эт\S* год/i, "this_year"],
];

/** Finds a period mentioned in the user's own words. */
export function inferPeriod(question: string): string | undefined {
  const text = question.toLowerCase();
  const span = text.match(
    /(?:last|past|previous|ב?־?\s?)(\d{1,3})\s*(day|days|week|weeks|month|months|year|years|ימים|שבועות|חודשים|שנים|дн\S*|недел\S*|месяц\S*|год\S*|лет)/i,
  );
  if (span) {
    const count = Number(span[1]);
    const unit = span[2].toLowerCase();
    if (/^(day|ימים|дн)/.test(unit)) return `last_${count}_days`;
    if (/^(week|שבוע|недел)/.test(unit)) return `last_${count * 7}_days`;
    if (/^(month|חודש|месяц)/.test(unit)) return `last_${count}_months`;
    return `last_${count * 12}_months`;
  }
  for (const [pattern, period] of PERIOD_PATTERNS)
    if (pattern.test(text)) return period;
  const year = text.match(/\b(20\d{2})\b/);
  return year ? year[1] : undefined;
}

/**
 * Keyword fallback for when a small model misses the JSON protocol. Every
 * branch maps to read-only tools.
 */
export function inferToolCalls(question: string): ChatToolCall[] {
  const text = question.toLowerCase();
  const period = inferPeriod(text);
  const withPeriod = (args: ChatToolArgs = {}) =>
    period ? { ...args, period } : args;
  const calls: ChatToolCall[] = [];
  const add = (name: ChatToolName, args: ChatToolArgs = {}) => {
    if (!calls.some((call) => call.name === name))
      calls.push({ name, args });
  };
  if (isAdviceQuestion(text)) {
    add("financial_health");
    add("financial_snapshot");
  }
  if (
    /(highest|largest|biggest|most expensive|הכי גבוה|הכי גדולה|הוצאה הגדולה|самый большой|крупнейш)/i.test(
      text,
    )
  )
    add("largest_expenses", withPeriod());
  if (/(recent|latest|last transactions|אחרונ|последн\S* транзакц)/i.test(text))
    add("recent_transactions");
  if (/(net worth|worth|שווי נקי|הון|чист\S* стоимост|капитал)/i.test(text))
    add("net_worth", withPeriod());
  else if (
    /(how much money do i have|money do i have|כמה כסף יש|сколько у меня денег)/i.test(
      text,
    )
  )
    add("net_worth", withPeriod());
  if (/(account|balance|חשבון|יתרה|сч[её]т|баланс)/i.test(text))
    add(period ? "net_worth" : "accounts", withPeriod());
  if (/(budget|תקציב|бюджет)/i.test(text)) add("budgets");
  if (
    /(subscription|recurring|bill|upcoming|מנוי|חוזר|קבוע|подписк|регулярн)/i.test(
      text,
    )
  )
    add("recurring");
  if (/(compare|versus|vs\.?|more than last|השווא|לעומת|сравн)/i.test(text))
    add("compare_periods", { period: period ?? "this_month", periodB: "last_month" });
  if (
    /(by category|per category|which categor|categor|קטגורי|категор)/i.test(text)
  )
    add("spending_summary", withPeriod({ groupBy: "category" }));
  if (/(merchant|store|shop|where do i|בית עסק|חנות|магазин)/i.test(text))
    add("spending_summary", withPeriod({ groupBy: "merchant" }));
  if (
    /(income|earn|salary|saving|save|cash ?flow|\bnet\b(?! worth)|הכנס|משכורת|חיסכון|доход|зарплат|сбережен)/i.test(
      text,
    )
  )
    add("cash_flow", withPeriod());
  if (/(exchange rate|currency rate|שער|курс)/i.test(text)) add("exchange_rates");
  if (/(goal|loan|debt|asset|mortgage|יעד|הלוואה|חוב|נכס|цел|кредит|долг|актив)/i.test(text))
    add("goals_loans_assets");
  if (
    !calls.length &&
    /(spend|spent|expense|cost|pay|paid|how much|total|הוצא|שילמ|כמה|трат|расход|сколько)/i.test(
      text,
    )
  )
    add("cash_flow", withPeriod());
  return calls;
}

/** A small model will often say it lacks access instead of calling a tool. */
export function looksLikeMissingData(answer: string) {
  return /(do not|don't|cannot|can't|unable to|no) (have )?(access|information|data)|not have (access|information)|אין לי (גישה|מידע)|нет доступа|нет информации/i.test(
    answer,
  );
}

export type DateRange = { start: Date; end: Date; label: string };

function day(date: Date, offset = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function isoDay(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3] ?? 1),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Resolves a model-provided period to a half-open local-date range. Unknown
 * values yield null so callers can fall back to their own default.
 */
export function resolvePeriod(
  args: Pick<ChatToolArgs, "period" | "from" | "to">,
  now: Date,
  monthStartDay: number,
): DateRange | null {
  const from = parseDay(args.from);
  const to = parseDay(args.to);
  if (from || to) {
    const start = from ?? new Date(1970, 0, 1);
    const end = to ? day(to, 1) : day(now, 1);
    return { start, end, label: `${isoDay(start)}..${isoDay(day(end, -1))}` };
  }
  const period = args.period
    ?.toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (!period) return null;
  const today = day(now);
  const range = (start: Date, end: Date) => ({
    start,
    end,
    label: `${isoDay(start)}..${isoDay(day(end, -1))}`,
  });
  switch (period) {
    case "all":
    case "all_time":
      return { start: new Date(1970, 0, 1), end: day(now, 1), label: "all time" };
    case "today":
      return range(today, day(now, 1));
    case "yesterday":
      return range(day(now, -1), today);
    case "this_week":
      return range(day(now, -now.getDay()), day(now, 1));
    case "last_week":
      return range(day(now, -now.getDay() - 7), day(now, -now.getDay()));
    case "this_month":
    case "current_month": {
      const month = financialMonth(now, monthStartDay, 0);
      return range(month.start, month.end);
    }
    case "last_month":
    case "previous_month": {
      const month = financialMonth(now, monthStartDay, -1);
      return range(month.start, month.end);
    }
    case "this_year":
      return range(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1));
    case "last_year":
    case "previous_year":
      return range(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1));
  }
  const rolling = period.match(/^(?:last|past)_(\d{1,4})_(day|days|week|weeks|month|months|year|years)$/);
  if (rolling) {
    const count = Number(rolling[1]);
    const unit = rolling[2];
    const start = unit.startsWith("day")
      ? day(now, -(count - 1))
      : unit.startsWith("week")
        ? day(now, -(count * 7 - 1))
        : unit.startsWith("month")
          ? new Date(now.getFullYear(), now.getMonth() - count, now.getDate() + 1)
          : new Date(now.getFullYear() - count, now.getMonth(), now.getDate() + 1);
    return range(start, day(now, 1));
  }
  const month = period.match(/^(\d{4})_(\d{1,2})$/);
  if (month) {
    const start = new Date(Number(month[1]), Number(month[2]) - 1, 1);
    return range(start, new Date(start.getFullYear(), start.getMonth() + 1, 1));
  }
  const year = period.match(/^(\d{4})$/);
  if (year)
    return range(new Date(Number(year[1]), 0, 1), new Date(Number(year[1]) + 1, 0, 1));
  return null;
}

export { isoDay };
