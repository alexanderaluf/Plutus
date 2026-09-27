import type { ChatToolCall } from "./chat-tool-protocol";
import type { FilledIconName } from "@/shared/ui/filled-icon";

export const COMMAND_GROUPS = [
  "overview",
  "spending",
  "accounts",
  "budgets",
  "bills",
  "wealth",
  "plan",
  "actions",
] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/**
 * An entry in the "/" menu. `calls` run immediately with exactly those
 * tools; `template` is placed in the message box for the user to finish
 * (used for anything that needs an amount, a name or a confirmation).
 */
export type ChatCommand = {
  id: string;
  group: CommandGroup;
  icon: FilledIconName;
  calls?: ChatToolCall[];
  template?: true;
};

const run = (name: ChatToolCall["name"], args: ChatToolCall["args"] = {}) => [{ name, args }];

export const CHAT_COMMANDS: readonly ChatCommand[] = [
  { id: "checkup", group: "overview", icon: "shield-check", calls: run("financial_advice_context") },
  { id: "priorities", group: "overview", icon: "bell", calls: run("financial_priorities") },
  { id: "health", group: "overview", icon: "trending-up", calls: run("financial_health") },
  { id: "summary", group: "overview", icon: "notes", calls: run("financial_snapshot") },
  { id: "dataCheck", group: "overview", icon: "magnify", calls: run("data_quality_audit") },

  { id: "spendingByCategory", group: "spending", icon: "chart-donut-variant", calls: run("spending_summary", { period: "this_month", groupBy: "category" }) },
  { id: "spendingByStore", group: "spending", icon: "shopping", calls: run("spending_summary", { period: "this_month", groupBy: "merchant" }) },
  { id: "spendingTrend", group: "spending", icon: "trending-up", calls: run("spending_trend", { months: 6 }) },
  { id: "cashFlow", group: "spending", icon: "swap-horizontal", calls: run("cash_flow", { period: "this_month" }) },
  { id: "compareMonths", group: "spending", icon: "calendar", calls: run("compare_periods", { period: "this_month", periodB: "last_month" }) },
  { id: "biggestExpenses", group: "spending", icon: "trending-down", calls: run("largest_expenses", { period: "this_month" }) },
  { id: "recent", group: "spending", icon: "clock", calls: run("recent_transactions") },
  { id: "income", group: "spending", icon: "currency-usd", calls: run("income_analysis") },
  { id: "unusual", group: "spending", icon: "eye", calls: run("unusual_transactions") },
  { id: "duplicates", group: "spending", icon: "copy", calls: run("duplicate_transaction_candidates") },
  { id: "uncategorized", group: "spending", icon: "tag", calls: run("uncategorized_transactions") },
  { id: "storeHistory", group: "spending", icon: "map-marker", template: true },

  { id: "netWorth", group: "accounts", icon: "wallet", calls: run("net_worth") },
  { id: "netWorthHistory", group: "accounts", icon: "trending-up", calls: run("net_worth_history") },
  { id: "accounts", group: "accounts", icon: "bank", calls: run("accounts") },
  { id: "availableCash", group: "accounts", icon: "cash", calls: run("liquidity_analysis", { days: 30 }) },
  { id: "runway", group: "accounts", icon: "clock", calls: run("cash_runway") },
  { id: "creditCards", group: "accounts", icon: "credit-card", calls: run("credit_position") },
  { id: "cardPayments", group: "accounts", icon: "credit-card-chip", calls: run("card_payment_forecast") },
  { id: "currencies", group: "accounts", icon: "currency-exchange", calls: run("fx_exposure") },
  { id: "exchangeRates", group: "accounts", icon: "currency-exchange", calls: run("exchange_rates") },

  { id: "budgets", group: "budgets", icon: "wallet", calls: run("budgets") },
  { id: "budgetPace", group: "budgets", icon: "trending-up", calls: run("budget_forecast") },
  { id: "budgetIdeas", group: "budgets", icon: "tune", calls: run("budget_recommendations") },
  { id: "categories", group: "budgets", icon: "chart-donut-variant", calls: run("categories") },

  { id: "upcomingBills", group: "bills", icon: "calendar", calls: run("upcoming_obligations", { days: 30 }) },
  { id: "subscriptions", group: "bills", icon: "notifications-active", calls: run("subscription_analysis") },
  { id: "recurring", group: "bills", icon: "swap-horizontal", calls: run("recurring") },
  { id: "fixedCosts", group: "bills", icon: "home", calls: run("fixed_cost_analysis") },
  { id: "untrackedRepeats", group: "bills", icon: "magnify", calls: run("recurring_candidate_detector") },

  { id: "savings", group: "wealth", icon: "piggy-bank", calls: run("savings_accounts") },
  { id: "savingsFees", group: "wealth", icon: "receipt", calls: run("savings_fee_analysis") },
  { id: "goals", group: "wealth", icon: "trophy", calls: run("goals") },
  { id: "loans", group: "wealth", icon: "receipt", calls: run("loans") },
  { id: "assets", group: "wealth", icon: "home-variant", calls: run("assets") },
  { id: "wealthSplit", group: "wealth", icon: "chart-donut-variant", calls: run("wealth_allocation") },
  { id: "sharedBills", group: "wealth", icon: "swap-horizontal", calls: run("bill_split_status") },
  { id: "people", group: "wealth", icon: "account", calls: run("people_summary") },
  { id: "places", group: "wealth", icon: "map-marker", calls: run("places_summary") },
  { id: "labels", group: "wealth", icon: "tag", calls: run("labels_summary") },

  { id: "afford", group: "plan", icon: "cash", template: true },
  { id: "whatIf", group: "plan", icon: "experiment", template: true },
  { id: "forecast", group: "plan", icon: "trending-up", calls: run("cash_flow_forecast") },

  { id: "addExpense", group: "actions", icon: "plus", template: true },
  { id: "addIncome", group: "actions", icon: "plus", template: true },
  { id: "addBudget", group: "actions", icon: "wallet", template: true },
  { id: "addRecurring", group: "actions", icon: "swap-horizontal", template: true },
  { id: "addGoal", group: "actions", icon: "trophy", template: true },
  { id: "addCategory", group: "actions", icon: "tag", template: true },
  { id: "editTransaction", group: "actions", icon: "pencil", template: true },
  { id: "deleteTransaction", group: "actions", icon: "delete", template: true },
];

/** Case-, accent- and language-tolerant match on the visible name. */
export function filterCommands(commands: readonly ChatCommand[], query: string, label: (command: ChatCommand) => string) {
  const needle = query.trim().replace(/^\//, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
  if (!needle) return [...commands];
  return commands.filter((command) =>
    label(command).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase().includes(needle),
  );
}
