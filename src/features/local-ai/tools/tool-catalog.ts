/**
 * Every capability the chat can use, as plain data. The protocol parser and
 * the prompt read this file; execution lives in `tool-registry.ts`. Keeping
 * the catalog free of selectors avoids an import cycle and lets tests check
 * that each model-visible name has an implementation.
 */

export const TOOL_PACKS = [
  "core",
  "transactions",
  "accounts",
  "budgets",
  "recurring",
  "savings",
  "wealth",
  "metadata",
  "currency",
  "scenario",
  "mutation",
] as const;
export type ToolPack = (typeof TOOL_PACKS)[number];

/** Argument keys the model may send. Anything else is dropped. */
export type ToolArgKey =
  | "period"
  | "from"
  | "to"
  | "periodB"
  | "query"
  | "category"
  | "account"
  | "type"
  | "groupBy"
  | "sort"
  | "limit"
  | "offset"
  | "minAmount"
  | "maxAmount"
  | "days"
  | "months"
  | "id"
  | "merchant"
  | "person"
  | "place"
  | "label"
  | "budget"
  | "loan"
  | "currency"
  | "hasReceipt"
  | "interval"
  | "amount"
  | "fromCurrency"
  | "toCurrency"
  | "dateMode"
  | "date"
  | "percent"
  | "operation"
  | "recurring"
  | "contribution"
  | "extraPayment";

export type ToolSpec = {
  name: string;
  pack: ToolPack;
  args: readonly ToolArgKey[];
  /** One line shown to the model; keep it short for the on-device context. */
  guide: string;
};

const PERIOD_ARGS = ["period", "from", "to"] as const;
const FILTER_ARGS = [
  ...PERIOD_ARGS,
  "query",
  "category",
  "account",
  "type",
  "merchant",
  "person",
  "place",
  "label",
  "budget",
  "loan",
  "currency",
  "minAmount",
  "maxAmount",
  "hasReceipt",
] as const;

export const TOOL_CATALOG = [
  // Core
  {
    name: "financial_snapshot",
    pack: "core",
    args: [],
    guide:
      "compact overview of ALL data (balances, monthly totals, budgets, recurring, goals, net worth, warnings). Use when no specific tool fits.",
  },
  {
    name: "financial_health",
    pack: "core",
    args: [],
    guide:
      "health score with each pillar (savings, budgets, fixed costs, balance sheet) and rule-based findings.",
  },
  {
    name: "financial_priorities",
    pack: "core",
    args: [],
    guide:
      "ranked list of the user's biggest financial problems and opportunities, each with its measured impact.",
  },
  {
    name: "financial_advice_context",
    pack: "core",
    args: [],
    guide:
      "full multi-area evidence bundle for broad questions: how am I doing, how to improve, where to save.",
  },
  {
    name: "data_quality_audit",
    pack: "core",
    args: [],
    guide:
      "uncategorized, orphaned, duplicate or malformed records that reduce answer quality.",
  },
  {
    name: "analysis_coverage",
    pack: "core",
    args: [],
    guide:
      "how much history exists, and which trends or averages are reliable.",
  },
  // Transactions & spending
  {
    name: "search_transactions",
    pack: "transactions",
    args: [...FILTER_ARGS, "sort", "limit", "offset"],
    guide:
      "find/list transactions {query,category,account,type,merchant,person,place,label,budget,currency,period,minAmount,maxAmount,hasReceipt,sort,limit,offset}.",
  },
  {
    name: "transaction_details",
    pack: "transactions",
    args: ["id", "query"],
    guide: "one transaction in full {id or query}.",
  },
  {
    name: "merchant_analysis",
    pack: "transactions",
    args: ["merchant", "query", ...PERIOD_ARGS],
    guide:
      "count, total, average, median, monthly trend and first/last visit for a merchant or payee {merchant,period}.",
  },
  {
    name: "spending_summary",
    pack: "transactions",
    args: [...FILTER_ARGS, "groupBy", "limit"],
    guide:
      "totals grouped by category|parent_category|account|merchant|month|week|day|weekday|label|place|person|currency|budget {type,period,groupBy}.",
  },
  {
    name: "spending_trend",
    pack: "transactions",
    args: [...FILTER_ARGS, "interval", "months"],
    guide:
      "time series by day|week|month for all spending or one category/merchant/account/place/person/label {interval,months}.",
  },
  {
    name: "cash_flow",
    pack: "transactions",
    args: [...PERIOD_ARGS, "account", "category"],
    guide: "income, expenses, net and savings rate for a period.",
  },
  {
    name: "compare_periods",
    pack: "transactions",
    args: ["period", "periodB", "type", "groupBy", "category", "account"],
    guide:
      "compare two periods, grouped by category (default), merchant or account {period,periodB,type,groupBy}.",
  },
  {
    name: "largest_expenses",
    pack: "transactions",
    args: [...PERIOD_ARGS, "category", "account", "limit"],
    guide: "biggest expenses {period,limit}.",
  },
  {
    name: "recent_transactions",
    pack: "transactions",
    args: ["limit", "type", "account"],
    guide: "newest transactions {limit}.",
  },
  {
    name: "unusual_transactions",
    pack: "transactions",
    args: [...PERIOD_ARGS, "limit"],
    guide:
      "transactions far above their usual merchant/category amount, repeats and large foreign payments, with reasons.",
  },
  {
    name: "duplicate_transaction_candidates",
    pack: "transactions",
    args: [...PERIOD_ARGS, "days", "limit"],
    guide:
      "likely duplicate transactions (same amount, account and name close in time) with a match score.",
  },
  {
    name: "uncategorized_transactions",
    pack: "transactions",
    args: [...PERIOD_ARGS, "limit"],
    guide: "transactions without a valid category.",
  },
  {
    name: "income_analysis",
    pack: "transactions",
    args: [...PERIOD_ARGS, "months"],
    guide:
      "income sources, recurring vs irregular, monthly stability, trend and next expected income.",
  },
  // Accounts & credit
  {
    name: "accounts",
    pack: "accounts",
    args: [],
    guide: "every account with balance, credit limit and cycle spending.",
  },
  {
    name: "account_details",
    pack: "accounts",
    args: ["account", "id", ...PERIOD_ARGS],
    guide:
      "one account: balance, period income/expense/transfers, recent transactions {account}.",
  },
  {
    name: "account_balance_history",
    pack: "accounts",
    args: ["account", "id", "months", "interval"],
    guide: "account balance rebuilt at each month/week end {account,months}.",
  },
  {
    name: "liquidity_analysis",
    pack: "accounts",
    args: ["days"],
    guide:
      "liquid cash vs locked savings vs card debt, and free cash after upcoming commitments {days}.",
  },
  {
    name: "credit_position",
    pack: "accounts",
    args: [],
    guide:
      "each card's debt, limit, utilization, payment day, linked bank and whether the bank covers the payment.",
  },
  {
    name: "card_payment_forecast",
    pack: "accounts",
    args: ["days"],
    guide: "projected card payment amounts and dates {days}.",
  },
  {
    name: "cash_runway",
    pack: "accounts",
    args: [],
    guide:
      "how many months liquid cash covers spending, under several baselines.",
  },
  // Budgets
  {
    name: "budgets",
    pack: "budgets",
    args: [],
    guide: "budgets with spent, limit and remaining.",
  },
  {
    name: "budget_details",
    pack: "budgets",
    args: ["budget", "id"],
    guide:
      "one budget: scope, spent, remaining, days left, daily allowance, top contributors, previous period {budget}.",
  },
  {
    name: "budget_forecast",
    pack: "budgets",
    args: ["budget", "id"],
    guide:
      "pace of every (or one) budget: projected end spend, on_track|at_risk|over_budget, exhaustion date.",
  },
  {
    name: "budget_recommendations",
    pack: "budgets",
    args: ["category", "percent"],
    guide:
      "candidate budget amounts per category from 3-month average, 6-month median and a reduction target {category,percent}.",
  },
  // Recurring
  {
    name: "recurring",
    pack: "recurring",
    args: ["days"],
    guide: "subscriptions, recurring bills/income and upcoming payments {days}.",
  },
  {
    name: "upcoming_obligations",
    pack: "recurring",
    args: ["days"],
    guide:
      "chronological calendar of bills, income, card payments and loan dues in the next N days {days}.",
  },
  {
    name: "subscription_analysis",
    pack: "recurring",
    args: [],
    guide:
      "active recurring expenses with monthly/annual cost, share of income and next charge.",
  },
  {
    name: "fixed_cost_analysis",
    pack: "recurring",
    args: [],
    guide: "fixed recurring costs as a share of income, by category.",
  },
  {
    name: "recurring_history",
    pack: "recurring",
    args: ["id", "query"],
    guide: "processed/skipped occurrences of one recurring payment {id or query}.",
  },
  {
    name: "recurring_candidate_detector",
    pack: "recurring",
    args: [],
    guide:
      "repeating transactions that look like untracked subscriptions or bills.",
  },
  // Savings
  {
    name: "savings_accounts",
    pack: "savings",
    args: [],
    guide: "savings accounts with product, balance, principal and earnings.",
  },
  {
    name: "savings_product_details",
    pack: "savings",
    args: ["account", "id"],
    guide:
      "one savings product: provider, contributions, return, liquidity, maturity, fees, tax {account}.",
  },
  {
    name: "savings_projection",
    pack: "savings",
    args: ["account", "id", "months", "contribution"],
    guide:
      "compound projection of a savings account over N months with stored return and fees {account,months,contribution}.",
  },
  {
    name: "savings_withdrawal_estimate",
    pack: "savings",
    args: ["account", "id", "amount"],
    guide: "estimated net value after fees and tax if withdrawn now {account}.",
  },
  {
    name: "savings_fee_analysis",
    pack: "savings",
    args: ["account", "id"],
    guide: "yearly management, contribution and performance fee cost.",
  },
  {
    name: "contribution_analysis",
    pack: "savings",
    args: ["account", "id"],
    guide: "personal vs employer contributions and their yearly effect.",
  },
  // Wealth
  {
    name: "net_worth",
    pack: "wealth",
    args: [...PERIOD_ARGS],
    guide: "assets, debts and net worth now, or at the end of a period.",
  },
  {
    name: "net_worth_history",
    pack: "wealth",
    args: ["months"],
    guide: "net worth at each month end, rebuilt from transactions {months}.",
  },
  {
    name: "goals",
    pack: "wealth",
    args: [],
    guide: "savings goals with progress.",
  },
  {
    name: "goal_details",
    pack: "wealth",
    args: ["id", "query"],
    guide: "one goal: progress, gap and time left {id or query}.",
  },
  {
    name: "goal_feasibility",
    pack: "wealth",
    args: ["id", "query", "date"],
    guide:
      "required monthly saving for a goal vs historical free cash flow {id,date}.",
  },
  {
    name: "loans",
    pack: "wealth",
    args: [],
    guide: "loans and debts.",
  },
  {
    name: "loan_details",
    pack: "wealth",
    args: ["id", "query"],
    guide: "one loan with linked payments {id or query}.",
  },
  {
    name: "debt_payoff_scenario",
    pack: "wealth",
    args: ["id", "query", "extraPayment"],
    guide:
      "months and interest to repay a loan with an optional extra monthly payment {id,extraPayment}.",
  },
  {
    name: "assets",
    pack: "wealth",
    args: [],
    guide: "assets and valuables.",
  },
  {
    name: "wealth_allocation",
    pack: "wealth",
    args: [],
    guide: "wealth split across cash, savings products and assets, and liabilities.",
  },
  {
    name: "bill_split_status",
    pack: "wealth",
    args: ["query"],
    guide: "shared bills with each participant's share, paid and remaining.",
  },
  {
    name: "goals_loans_assets",
    pack: "wealth",
    args: [],
    guide: "savings goals, loans and assets together.",
  },
  // Metadata
  {
    name: "categories",
    pack: "metadata",
    args: [],
    guide: "category tree with this and last month totals.",
  },
  {
    name: "category_details",
    pack: "metadata",
    args: ["category", "id", ...PERIOD_ARGS],
    guide:
      "one category with children, direct vs total amount, previous period, merchants and accounts {category,period}.",
  },
  {
    name: "labels_summary",
    pack: "metadata",
    args: ["label", ...PERIOD_ARGS],
    guide: "spending per label/tag {label,period}.",
  },
  {
    name: "places_summary",
    pack: "metadata",
    args: ["place", ...PERIOD_ARGS],
    guide: "spending per place/location {place,period}.",
  },
  {
    name: "people_summary",
    pack: "metadata",
    args: ["person", ...PERIOD_ARGS],
    guide: "money spent, received or transferred with each person {person,period}.",
  },
  {
    name: "templates",
    pack: "metadata",
    args: [],
    guide: "saved transaction templates.",
  },
  // Currency
  {
    name: "exchange_rates",
    pack: "currency",
    args: [],
    guide: "saved currency rates.",
  },
  {
    name: "currency_convert",
    pack: "currency",
    args: ["amount", "fromCurrency", "toCurrency"],
    guide: "convert an amount with saved rates {amount,fromCurrency,toCurrency}.",
  },
  {
    name: "fx_exposure",
    pack: "currency",
    args: [],
    guide: "balances and recent spending per currency.",
  },
  {
    name: "fx_transaction_analysis",
    pack: "currency",
    args: [...PERIOD_ARGS, "currency"],
    guide:
      "foreign-currency transactions priced at the rate saved on each transaction {period,currency}.",
  },
  // Scenarios (pure, read-only)
  {
    name: "affordability_check",
    pack: "scenario",
    args: ["amount", "currency", "date", "account", "recurring"],
    guide:
      "can the user afford a purchase: cash before/after, obligations and income until the date {amount,currency,date,recurring}.",
  },
  {
    name: "scenario_simulation",
    pack: "scenario",
    args: ["operation", "amount", "percent", "category", "id", "query"],
    guide:
      "what-if: operation reduce_category|remove_recurring|add_recurring|one_time_purchase|income_change|extra_loan_payment|savings_change {operation,amount,percent,category,id}.",
  },
  {
    name: "cash_flow_forecast",
    pack: "scenario",
    args: ["months"],
    guide:
      "month-by-month forecast from recurring items plus average variable spending {months}.",
  },
  // Mutation proposals — never executes anything.
  {
    name: "prepare_change",
    pack: "mutation",
    args: [],
    guide:
      '{operation:create|update|delete|archive, entityType:transaction|budget|recurring|category|account|goal|loan|asset|template|label|place|person|bill_splitter, entityId?, fields:{...}} prepares a change for the user to review. It does NOT save anything.',
  },
] as const satisfies readonly ToolSpec[];

export type ChatToolName = (typeof TOOL_CATALOG)[number]["name"];

export const CHAT_TOOL_NAMES = TOOL_CATALOG.map(
  (tool) => tool.name,
) as readonly ChatToolName[];

const BY_NAME = new Map<string, ToolSpec>(
  TOOL_CATALOG.map((tool) => [tool.name, tool]),
);

export function toolSpec(name: string): ToolSpec | undefined {
  return BY_NAME.get(name);
}

export function isToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && BY_NAME.has(value);
}

export function toolsInPacks(packs: readonly ToolPack[]) {
  return TOOL_CATALOG.filter((tool) => packs.includes(tool.pack));
}

export const PERIOD_GUIDE =
  "period values: today, yesterday, this_week, last_week, this_month (financial month), last_month, this_calendar_month, last_calendar_month, this_quarter, last_quarter, year_to_date, this_year, last_year, last_N_days, last_N_weeks, last_N_months, next_N_days, since_payday, all, YYYY, YYYY-MM, or from/to dates YYYY-MM-DD.";

/** Guide text for the packs selected for this question only. */
export function toolGuide(packs: readonly ToolPack[]) {
  return [
    ...toolsInPacks(packs).map((tool) => `${tool.name}: ${tool.guide}`),
    PERIOD_GUIDE,
  ].join("\n");
}
