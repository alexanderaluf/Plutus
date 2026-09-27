import type { BackupDocument } from "@/data/model/backup-document";

import type { ChatToolArgs, ChatToolCall, ChatToolName } from "./chat-tool-protocol";
import type { EvidenceBundle } from "./evidence";
import {
  accountBalanceHistory,
  accountDetails,
  accountsTool,
  cardPaymentForecast,
  cashRunway,
  creditPosition,
  liquidityAnalysis,
} from "./tools/account-tools";
import {
  budgetDetails,
  budgetForecast,
  budgetRecommendations,
  budgetsTool,
} from "./tools/budget-tools";
import {
  adviceContextTool,
  healthTool,
  prioritiesTool,
  snapshotTool,
} from "./tools/core-tools";
import {
  currencyConvert,
  exchangeRatesTool,
  fxExposure,
  fxTransactionAnalysis,
} from "./tools/currency-tools";
import { analysisCoverage, dataQualityAudit } from "./tools/data-quality-tools";
import {
  categoriesTool,
  categoryDetails,
  labelsSummary,
  peopleSummary,
  placesSummary,
  templatesTool,
} from "./tools/metadata-tools";
import {
  fixedCostAnalysis,
  recurringCandidateDetector,
  recurringHistory,
  recurringTool,
  subscriptionAnalysis,
  upcomingObligations,
} from "./tools/recurring-tools";
import {
  contributionAnalysis,
  savingsAccounts,
  savingsFeeAnalysis,
  savingsProductDetails,
  savingsProjection,
  savingsWithdrawalEstimate,
} from "./tools/savings-tools";
import {
  affordabilityCheck,
  cashFlowForecast,
  scenarioSimulation,
} from "./tools/scenario-tools";
import {
  MENTION_KIND_NAMES,
  ToolContext,
  ToolOutput,
  MAX_CARDS,
  type ChatCard,
} from "./tools/tool-context";
import {
  cashFlow,
  comparePeriods,
  duplicateTransactions,
  incomeAnalysis,
  merchantAnalysis,
  spendingSummary,
  spendingTrend,
  transactionDetails,
  transactionList,
  uncategorizedTransactions,
  unusualTransactions,
} from "./tools/transaction-tools";
import {
  assetsTool,
  billSplitStatus,
  debtPayoffScenario,
  goalDetails,
  goalFeasibility,
  goalsTool,
  holdingsTool,
  loanDetails,
  loansTool,
  netWorth,
  netWorthHistory,
  wealthAllocation,
} from "./tools/wealth-tools";

export type { ChatCard };

type ReadToolName = Exclude<ChatToolName, "prepare_change">;
type ToolRunner = (context: ToolContext, args: ChatToolArgs, budget: number) => ToolOutput;

/**
 * Trusted implementations for every read-only tool in the catalog. Each
 * runner reads the document through selectors and returns text plus
 * structured evidence; none of them can write.
 */
export const TOOL_RUNNERS: Record<ReadToolName, ToolRunner> = {
  financial_snapshot: (context, _args, budget) => snapshotTool(context, budget),
  financial_health: (context) => healthTool(context),
  financial_priorities: (context) => prioritiesTool(context),
  financial_advice_context: (context) => adviceContextTool(context),
  data_quality_audit: (context) => dataQualityAudit(context),
  analysis_coverage: (context) => analysisCoverage(context),
  search_transactions: (context, args) =>
    transactionList(context, "search_transactions", args, { sort: "newest", limit: 15, period: null }),
  transaction_details: transactionDetails,
  merchant_analysis: merchantAnalysis,
  spending_summary: spendingSummary,
  spending_trend: spendingTrend,
  cash_flow: cashFlow,
  compare_periods: comparePeriods,
  largest_expenses: (context, args) =>
    transactionList(context, "largest_expenses", args, {
      type: "expense",
      sort: "largest",
      limit: 5,
      period: null,
    }),
  recent_transactions: (context, args) =>
    transactionList(context, "recent_transactions", args, { sort: "newest", limit: 8, period: null }),
  unusual_transactions: unusualTransactions,
  duplicate_transaction_candidates: duplicateTransactions,
  uncategorized_transactions: uncategorizedTransactions,
  income_analysis: incomeAnalysis,
  accounts: (context) => accountsTool(context),
  account_details: accountDetails,
  account_balance_history: accountBalanceHistory,
  liquidity_analysis: liquidityAnalysis,
  credit_position: (context) => creditPosition(context),
  card_payment_forecast: cardPaymentForecast,
  cash_runway: (context) => cashRunway(context),
  budgets: (context) => budgetsTool(context),
  budget_details: budgetDetails,
  budget_forecast: budgetForecast,
  budget_recommendations: budgetRecommendations,
  recurring: recurringTool,
  upcoming_obligations: upcomingObligations,
  subscription_analysis: (context) => subscriptionAnalysis(context),
  fixed_cost_analysis: (context) => fixedCostAnalysis(context),
  recurring_history: recurringHistory,
  recurring_candidate_detector: (context) => recurringCandidateDetector(context),
  savings_accounts: (context) => savingsAccounts(context),
  savings_product_details: savingsProductDetails,
  savings_projection: savingsProjection,
  savings_withdrawal_estimate: savingsWithdrawalEstimate,
  savings_fee_analysis: savingsFeeAnalysis,
  contribution_analysis: contributionAnalysis,
  net_worth: netWorth,
  net_worth_history: netWorthHistory,
  goals: (context) => goalsTool(context),
  goal_details: goalDetails,
  goal_feasibility: goalFeasibility,
  loans: (context) => loansTool(context),
  loan_details: loanDetails,
  debt_payoff_scenario: debtPayoffScenario,
  assets: (context) => assetsTool(context),
  wealth_allocation: (context) => wealthAllocation(context),
  bill_split_status: billSplitStatus,
  goals_loans_assets: (context) => holdingsTool(context),
  categories: (context) => categoriesTool(context),
  category_details: categoryDetails,
  labels_summary: labelsSummary,
  places_summary: placesSummary,
  people_summary: peopleSummary,
  templates: (context) => templatesTool(context),
  exchange_rates: (context) => exchangeRatesTool(context),
  currency_convert: currencyConvert,
  fx_exposure: (context) => fxExposure(context),
  fx_transaction_analysis: fxTransactionAnalysis,
  affordability_check: affordabilityCheck,
  scenario_simulation: scenarioSimulation,
  cash_flow_forecast: cashFlowForecast,
};

/** Bundles that already include a snapshot-sized digest run last. */
const FILL_LAST = new Set<string>(["financial_snapshot"]);

export type ChatToolRun = {
  facts: string;
  cards: ChatCard[];
  /** Mention reference (e.g. "A1") → record, for inline cards in the answer. */
  mentions: Record<string, ChatCard>;
  evidence: EvidenceBundle;
  failures: string[];
};

/**
 * Runs the requested read-only tools and returns plain-text facts capped at
 * `charBudget`, the structured evidence bundle, and the records the chat
 * shows as live cards. Unknown or mutation tool names are ignored here.
 */
export function runChatTools(
  document: BackupDocument,
  calls: readonly ChatToolCall[],
  options: { charBudget: number; now?: Date; question?: string },
): ChatToolRun {
  const context = new ToolContext(document, options.now ?? new Date());
  const unique = calls.filter(
    (call, index) =>
      call.name !== "prepare_change" &&
      calls.findIndex(
        (other) =>
          other.name === call.name &&
          JSON.stringify(other.args) === JSON.stringify(call.args),
      ) === index,
  );
  // Specific tools run first; the snapshot fills whatever budget remains.
  const ordered = [
    ...unique.filter((call) => !FILL_LAST.has(call.name)),
    ...unique.filter((call) => FILL_LAST.has(call.name)),
  ];
  const lines: string[] = [];
  const cards: ChatCard[] = [];
  const failures: string[] = [];
  const evidence: EvidenceBundle = {
    question: options.question ?? "",
    profileId: context.profileId,
    reportingCurrency: context.currency,
    generatedAt: context.generatedAt,
    tools: [],
    facts: [],
    warnings: [],
    missingData: [],
    assumptions: [],
    text: "",
  };
  let used = 0;
  let truncated = false;
  for (const call of ordered) {
    if (truncated) break;
    const runner = TOOL_RUNNERS[call.name as ReadToolName];
    if (!runner) continue;
    let output: ToolOutput;
    try {
      output = runner(context, call.args, options.charBudget - used);
    } catch {
      // A malformed imported record must not break the whole answer.
      failures.push(call.name);
      lines.push(`[${call.name}] could not be computed from the stored data`);
      continue;
    }
    evidence.tools.push(call.name);
    for (const line of output.lines) {
      if (used + line.length + 1 > options.charBudget) {
        lines.push("(truncated to fit the on-device context)");
        truncated = true;
        break;
      }
      used += line.length + 1;
      lines.push(line);
    }
    evidence.facts.push(...output.facts);
    for (const [target, source] of [
      [evidence.warnings, output.warnings],
      [evidence.missingData, output.missing],
      [evidence.assumptions, output.assumptions],
    ] as const)
      for (const item of source) if (!target.includes(item)) target.push(item);
    cards.push(...output.cards);
  }
  // References the answer may use to place record cards inline.
  const mentions: Record<string, ChatCard> = {};
  const mentionLines: string[] = [];
  for (const [ref, { card, label }] of context.mentions) {
    if (mentionLines.length >= 24) break;
    if (card.kind === "change_proposal") continue;
    mentions[ref] = card;
    mentionLines.push(`@${ref} = ${label} (${MENTION_KIND_NAMES[card.kind]})`);
  }
  if (mentionLines.length) {
    const block = `[mentions] records you can show inline: ${mentionLines.join("; ")}`;
    const room = options.charBudget - used;
    if (room > 80) {
      const fitted = block.length + 1 <= room ? block : `${block.slice(0, room - 2)}…`;
      lines.push(fitted);
      used += fitted.length + 1;
      // Drop references that were cut off.
      for (const ref of Object.keys(mentions)) if (!fitted.includes(`@${ref} `)) delete mentions[ref];
    } else for (const ref of Object.keys(mentions)) delete mentions[ref];
  }
  const notes = [
    evidence.warnings.length ? `WARNINGS: ${evidence.warnings.join("; ")}` : "",
    evidence.missingData.length ? `MISSING DATA: ${evidence.missingData.join("; ")}` : "",
    evidence.assumptions.length ? `ASSUMPTIONS: ${evidence.assumptions.join("; ")}` : "",
  ].filter(Boolean);
  // Notes share the same budget so the prompt never outgrows the context.
  const noteText = notes.join("\n").slice(0, Math.max(0, options.charBudget - used));
  const facts = noteText ? `${lines.join("\n")}\n${noteText}` : lines.join("\n");
  evidence.text = facts;
  return {
    facts,
    evidence,
    failures,
    mentions,
    cards: cards
      .filter(
        (card, index) =>
          cards.findIndex(
            (other) => JSON.stringify(other) === JSON.stringify(card),
          ) === index,
      )
      .slice(0, MAX_CARDS * 2),
  };
}
