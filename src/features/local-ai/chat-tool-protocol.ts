import { financialMonth } from "@/data/model/financial-month";

import {
  sanitizeChangeArgs,
  type PrepareChangeArgs,
} from "./mutations/change-types";
import {
  CHAT_TOOL_NAMES,
  isToolName,
  toolGuide,
  toolSpec,
  TOOL_PACKS,
  type ChatToolName,
  type ToolArgKey,
} from "./tools/tool-catalog";

/**
 * Tool names the model may request. Execution happens only in trusted
 * selectors; the model never sees or produces SQL, file paths or raw records.
 */
export { CHAT_TOOL_NAMES, type ChatToolName };

export type TransactionKind = "expense" | "income" | "transfer" | "all";
export type SummaryGroup =
  | "category"
  | "parent_category"
  | "account"
  | "merchant"
  | "month"
  | "week"
  | "day"
  | "weekday"
  | "label"
  | "place"
  | "person"
  | "currency"
  | "budget";
export type TransactionSort = "newest" | "oldest" | "largest" | "smallest";
export type TrendInterval = "day" | "week" | "month";
export type ScenarioOperation =
  | "reduce_category"
  | "remove_recurring"
  | "add_recurring"
  | "one_time_purchase"
  | "income_change"
  | "extra_loan_payment"
  | "savings_change";

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
  offset?: number;
  minAmount?: number;
  maxAmount?: number;
  days?: number;
  months?: number;
  id?: string;
  merchant?: string;
  person?: string;
  place?: string;
  label?: string;
  budget?: string;
  loan?: string;
  currency?: string;
  hasReceipt?: boolean;
  interval?: TrendInterval;
  amount?: number;
  fromCurrency?: string;
  toCurrency?: string;
  dateMode?: "latest" | "transaction";
  date?: string;
  percent?: number;
  operation?: ScenarioOperation;
  recurring?: boolean;
  contribution?: number;
  extraPayment?: number;
};

export type ChatToolCall = {
  name: ChatToolName;
  args: ChatToolArgs;
  /** Only set for `prepare_change`; validated again by the proposal builder. */
  change?: PrepareChangeArgs;
};

/** Every read tool, for tests and the whole-document fallback. */
export const CHAT_TOOL_GUIDE = toolGuide(
  TOOL_PACKS.filter((pack) => pack !== "mutation"),
);

const TYPES = new Set<TransactionKind>(["expense", "income", "transfer", "all"]);
const GROUPS = new Set<SummaryGroup>([
  "category",
  "parent_category",
  "account",
  "merchant",
  "month",
  "week",
  "day",
  "weekday",
  "label",
  "place",
  "person",
  "currency",
  "budget",
]);
const SORTS = new Set<TransactionSort>(["newest", "oldest", "largest", "smallest"]);
const INTERVALS = new Set<TrendInterval>(["day", "week", "month"]);
const OPERATIONS = new Set<ScenarioOperation>([
  "reduce_category",
  "remove_recurring",
  "add_recurring",
  "one_time_purchase",
  "income_change",
  "extra_loan_payment",
  "savings_change",
]);

const TEXT_KEYS = [
  "period",
  "from",
  "to",
  "periodB",
  "query",
  "category",
  "account",
  "id",
  "merchant",
  "person",
  "place",
  "label",
  "budget",
  "loan",
  "date",
] as const;
const NUMBER_KEYS = [
  "limit",
  "offset",
  "minAmount",
  "maxAmount",
  "days",
  "months",
  "amount",
  "percent",
  "contribution",
  "extraPayment",
] as const;
const CURRENCY_KEYS = ["currency", "fromCurrency", "toCurrency"] as const;

function readText(value: unknown, max = 80) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
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

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Untrusted model arguments are reduced to known keys and primitive values.
 * With a tool name, keys that tool does not accept are dropped as well.
 */
export function sanitizeToolArgs(value: unknown, tool?: string): ChatToolArgs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const allowed = tool ? toolSpec(tool)?.args : undefined;
  const accepts = (key: ToolArgKey) => !allowed || allowed.includes(key);
  const args: ChatToolArgs = {};
  for (const key of TEXT_KEYS) {
    if (!accepts(key)) continue;
    const text = readText(input[key]);
    if (text) args[key] = text;
  }
  for (const key of CURRENCY_KEYS) {
    if (!accepts(key)) continue;
    const code = readText(input[key])?.toUpperCase();
    if (code && /^[A-Z]{3}$/.test(code)) args[key] = code;
  }
  const type = readText(input.type)?.toLowerCase();
  if (accepts("type") && type && TYPES.has(type as TransactionKind))
    args.type = type as TransactionKind;
  const groupBy = readText(input.groupBy ?? input.group_by)?.toLowerCase();
  if (accepts("groupBy") && groupBy && GROUPS.has(groupBy as SummaryGroup))
    args.groupBy = groupBy as SummaryGroup;
  const sort = readText(input.sort)?.toLowerCase();
  if (accepts("sort") && sort && SORTS.has(sort as TransactionSort))
    args.sort = sort as TransactionSort;
  const interval = readText(input.interval)?.toLowerCase();
  if (accepts("interval") && interval && INTERVALS.has(interval as TrendInterval))
    args.interval = interval as TrendInterval;
  const operation = readText(input.operation)?.toLowerCase();
  if (
    accepts("operation") &&
    operation &&
    OPERATIONS.has(operation as ScenarioOperation)
  )
    args.operation = operation as ScenarioOperation;
  const dateMode = readText(input.dateMode)?.toLowerCase();
  if (accepts("dateMode") && (dateMode === "latest" || dateMode === "transaction"))
    args.dateMode = dateMode;
  for (const key of ["hasReceipt", "recurring"] as const) {
    const flag = readBoolean(input[key]);
    if (accepts(key) && flag !== undefined) args[key] = flag;
  }
  for (const key of NUMBER_KEYS) {
    if (!accepts(key)) continue;
    const number = readNumber(input[key]);
    if (number !== undefined) args[key] = number;
  }
  if (args.limit !== undefined) args.limit = clamp(Math.round(args.limit), 1, 50);
  if (args.offset !== undefined)
    args.offset = clamp(Math.round(args.offset), 0, 100_000);
  if (args.days !== undefined) args.days = clamp(Math.round(args.days), 1, 366);
  if (args.months !== undefined) args.months = clamp(Math.round(args.months), 1, 120);
  if (args.percent !== undefined) args.percent = clamp(args.percent, -100, 1000);
  for (const key of ["amount", "contribution", "extraPayment", "minAmount", "maxAmount"] as const)
    if (args[key] !== undefined && Math.abs(args[key]!) > 1e12) delete args[key];
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

function toolCall(name: ChatToolName, rawArgs: unknown): ChatToolCall {
  if (name === "prepare_change") {
    const change = sanitizeChangeArgs(rawArgs);
    return change ? { name, args: {}, change } : { name, args: {} };
  }
  return { name, args: sanitizeToolArgs(rawArgs, name) };
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
      calls.push(toolCall(item, {}));
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const name = entry.name ?? entry.tool;
    if (!isToolName(name)) continue;
    calls.push(
      toolCall(name, entry.args ?? entry.arguments ?? entry.parameters),
    );
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
    calls.push(toolCall(match[1], args));
  }
  // A bare list such as {"tools":["accounts","budgets"
  if (!calls.length)
    for (const name of CHAT_TOOL_NAMES)
      if (name !== "prepare_change" && new RegExp(`"${name}"`).test(output))
        calls.push({ name, args: {} });
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
  /(improve|advice|advise|tips?\b|recommend|suggest|should i|how am i doing|how are my finances|financial (health|situation|status)|healthy|analy[sz]e|review my|save more|saving more|where can i save|cut (back|down)|reduce (my )?(spending|expenses)|get out of debt|what('s| is) wrong|biggest (financial )?problems?|fix first|plan|overview|summary of my|לשפר|שיפור|עצה|עצות|טיפ|המלצ|מה כדאי|איך אני עומד|מצב(י)? הכלכלי|מצב כלכלי|בריאות פיננסית|לנתח|ניתוח|לחסוך|לקצץ|להפחית|תוכנית|סיכום|улучш|совет|рекоменд|как у меня дела|финансов\S* (здоров|положен|состоян)|проанализ|анализ|сэконом|сократить|план|обзор)/i;

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
  [/(since|from) (my )?(last )?pay ?day|since (my )?(last )?salary|מאז המשכורת|с (последней )?зарплат/i, "since_payday"],
  [/(until|before|till) (my )?(next )?(pay ?day|salary)|עד המשכורת|до (следующей )?зарплат/i, "until_payday"],
  [/(last|previous|past) week|שבוע שעבר|прошл\S* недел/i, "last_week"],
  [/this week|השבוע|эт\S* недел/i, "this_week"],
  [/(last|previous) calendar month|חודש קלנדרי קודם|прошл\S* календарн\S* месяц/i, "last_calendar_month"],
  [/this calendar month|calendar month|חודש קלנדרי|календарн\S* месяц/i, "this_calendar_month"],
  [/(last|previous|past) month|חודש שעבר|בחודש הקודם|прошл\S* месяц/i, "last_month"],
  [/this (financial )?month|החודש|эт\S* месяц/i, "this_month"],
  [/(last|previous) quarter|רבעון (קודם|שעבר)|прошл\S* квартал/i, "last_quarter"],
  [/this quarter|quarter|הרבעון|רבעון|квартал/i, "this_quarter"],
  [/since january|year to date|\bytd\b|מתחילת השנה|с (начала года|января)/i, "year_to_date"],
  [/(last|previous|past) year|שנה שעברה|прошл\S* год/i, "last_year"],
  [/this year|השנה|эт\S* год/i, "this_year"],
];

/** Finds a period mentioned in the user's own words. */
export function inferPeriod(question: string): string | undefined {
  const text = question.toLowerCase();
  const ahead = text.match(
    /(?:next|coming|upcoming|בה?־?\s?|в ближайшие|следующие)\s*(\d{1,3})\s*(day|days|week|weeks|ימים|שבועות|дн\S*|недел\S*)/i,
  );
  if (ahead && /(next|coming|upcoming|ה?באים|הקרובים|ближайш|следующ)/i.test(text)) {
    const count = Number(ahead[1]);
    return /^(week|שבוע|недел)/.test(ahead[2].toLowerCase())
      ? `next_${count * 7}_days`
      : `next_${count}_days`;
  }
  const span = text.match(
    /(?:last|past|previous|ב?־?\s?|за (?:последние )?)(\d{1,3})\s*(day|days|week|weeks|month|months|year|years|ימים|שבועות|חודשים|שנים|дн\S*|недел\S*|месяц\S*|год\S*|лет)/i,
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
 * branch maps to read-only tools; the intent router runs first and this
 * remains the final fallback.
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
  if (isAdviceQuestion(text)) add("financial_advice_context");
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

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
  /** How the boundaries were chosen, e.g. "financial month (day 10)". */
  basis?: string;
};

export type PeriodAnchors = {
  /** Most recent income that looks like a salary, if known. */
  lastPayday?: Date | null;
  /** Next scheduled recurring income, if known. */
  nextPayday?: Date | null;
};

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
 * values yield null so callers can fall back to their own default. The model
 * never computes boundaries itself.
 */
export function resolvePeriod(
  args: Pick<ChatToolArgs, "period" | "from" | "to">,
  now: Date,
  monthStartDay: number,
  anchors: PeriodAnchors = {},
): DateRange | null {
  const from = parseDay(args.from);
  const to = parseDay(args.to);
  if (from || to) {
    const start = from ?? new Date(1970, 0, 1);
    const end = to ? day(to, 1) : day(now, 1);
    return {
      start,
      end,
      label: `${isoDay(start)}..${isoDay(day(end, -1))}`,
      basis: "explicit dates",
    };
  }
  const period = args.period
    ?.toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (!period) return null;
  const today = day(now);
  const range = (start: Date, end: Date, basis?: string) => ({
    start,
    end,
    label: `${isoDay(start)}..${isoDay(day(end, -1))}`,
    ...(basis ? { basis } : {}),
  });
  const financialBasis = `financial month starting on day ${monthStartDay}`;
  const quarterStart = (offset: number) =>
    new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + offset * 3, 1);
  switch (period) {
    case "all":
    case "all_time":
      return {
        start: new Date(1970, 0, 1),
        end: day(now, 1),
        label: "all time",
        basis: "all records",
      };
    case "today":
      return range(today, day(now, 1));
    case "yesterday":
      return range(day(now, -1), today);
    case "this_week":
      return range(day(now, -now.getDay()), day(now, 1));
    case "last_week":
      return range(day(now, -now.getDay() - 7), day(now, -now.getDay()));
    case "this_month":
    case "current_month":
    case "this_financial_month": {
      const month = financialMonth(now, monthStartDay, 0);
      return range(month.start, month.end, financialBasis);
    }
    case "last_month":
    case "previous_month":
    case "last_financial_month": {
      const month = financialMonth(now, monthStartDay, -1);
      return range(month.start, month.end, financialBasis);
    }
    case "this_calendar_month":
      return range(
        new Date(now.getFullYear(), now.getMonth(), 1),
        new Date(now.getFullYear(), now.getMonth() + 1, 1),
        "calendar month",
      );
    case "last_calendar_month":
      return range(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
        new Date(now.getFullYear(), now.getMonth(), 1),
        "calendar month",
      );
    case "this_quarter":
      return range(quarterStart(0), quarterStart(1), "calendar quarter");
    case "last_quarter":
    case "previous_quarter":
      return range(quarterStart(-1), quarterStart(0), "calendar quarter");
    case "year_to_date":
    case "ytd":
    case "since_january":
      return range(new Date(now.getFullYear(), 0, 1), day(now, 1), "year to date");
    case "this_year":
      return range(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1));
    case "last_year":
    case "previous_year":
      return range(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1));
    case "since_payday": {
      if (anchors.lastPayday)
        return range(day(anchors.lastPayday), day(now, 1), "since the last salary income");
      const month = financialMonth(now, monthStartDay, 0);
      return range(month.start, day(now, 1), `no salary found; ${financialBasis}`);
    }
    case "until_payday":
    case "before_payday": {
      if (anchors.nextPayday && anchors.nextPayday > now)
        return range(today, day(anchors.nextPayday), "until the next scheduled income");
      const month = financialMonth(now, monthStartDay, 0);
      return range(today, month.end, `no scheduled income; until the ${financialBasis} ends`);
    }
  }
  const next = period.match(/^next_(\d{1,3})_(day|days|week|weeks)$/);
  if (next) {
    const count = Number(next[1]) * (next[2].startsWith("week") ? 7 : 1);
    return range(today, day(now, count + 1), "upcoming days");
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
    return range(start, day(now, 1), "rolling window ending today");
  }
  const month = period.match(/^(\d{4})_(\d{1,2})$/);
  if (month) {
    const start = new Date(Number(month[1]), Number(month[2]) - 1, 1);
    return range(start, new Date(start.getFullYear(), start.getMonth() + 1, 1), "calendar month");
  }
  const year = period.match(/^(\d{4})$/);
  if (year)
    return range(new Date(Number(year[1]), 0, 1), new Date(Number(year[1]) + 1, 0, 1));
  return null;
}

export { isoDay };
