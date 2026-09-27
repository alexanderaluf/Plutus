import { identity } from "@/data/model/category-record";
import { isJsonObject, type JsonObject } from "@/data/model/json";
import {
  estimateSavingsWithdrawal,
  savingsDetailsToDraft,
  SAVINGS_PRODUCT_OPTIONS,
} from "@/data/model/savings-account";

import { type ChatToolArgs } from "../chat-tool-protocol";
import {
  mean,
  money,
  resolveOne,
  round2,
  ToolOutput,
  type ToolContext,
} from "./tool-context";

type SavingsView = {
  id: string;
  name: string;
  balance: number;
  currency: string;
  details: JsonObject | null;
  numbers: Record<
    | "contributedPrincipal"
    | "monthlyContribution"
    | "employerMonthlyContribution"
    | "expectedAnnualReturnRate"
    | "annualManagementFeeRate"
    | "contributionFeeRate"
    | "performanceFeeRate"
    | "earlyWithdrawalFeeRate"
    | "estimatedTaxRate"
    | "taxFreeAllowance"
    | "withdrawalNoticeDays",
    number
  >;
  draft: ReturnType<typeof savingsDetailsToDraft> | null;
};

function savingsViews(context: ToolContext): SavingsView[] {
  return context.memo("savingsViews", () =>
    context
      .accountsView()
      .filter((account) => account.kind === "savings")
      .map((account) => {
        const record = context.lookup("accounts").get(account.id);
        const details = isJsonObject(record?.savingsDetails) ? record!.savingsDetails as JsonObject : null;
        const draft = details ? savingsDetailsToDraft(details) : null;
        const read = (key: keyof SavingsView["numbers"]) => {
          const value = Number(String(draft?.[key] ?? "").replace(",", "."));
          return Number.isFinite(value) ? value : 0;
        };
        return {
          id: account.id,
          name: account.name,
          balance: account.balance,
          currency: account.currencyCode,
          details,
          draft,
          numbers: {
            contributedPrincipal: read("contributedPrincipal"),
            monthlyContribution: read("monthlyContribution"),
            employerMonthlyContribution: read("employerMonthlyContribution"),
            expectedAnnualReturnRate: read("expectedAnnualReturnRate"),
            annualManagementFeeRate: read("annualManagementFeeRate"),
            contributionFeeRate: read("contributionFeeRate"),
            performanceFeeRate: read("performanceFeeRate"),
            earlyWithdrawalFeeRate: read("earlyWithdrawalFeeRate"),
            estimatedTaxRate: read("estimatedTaxRate"),
            taxFreeAllowance: read("taxFreeAllowance"),
            withdrawalNoticeDays: read("withdrawalNoticeDays"),
          },
        };
      }),
  );
}

function findSavings(context: ToolContext, output: ToolOutput, args: ChatToolArgs) {
  const views = savingsViews(context);
  if (!args.id && !args.account && views.length === 1) return views[0];
  const record = resolveOne(context, output, "accounts", args.id ?? args.account, "savings account");
  const view = record ? views.find((item) => item.id === identity(record)) : null;
  if (record && !view) output.line(`${record.name} is not a savings account`);
  return view ?? null;
}

function productLabel(view: SavingsView) {
  if (!view.draft?.isDetailed) return "simple savings";
  return (
    SAVINGS_PRODUCT_OPTIONS.find((option) => option.value === view.draft!.productType)?.label ??
    view.draft.productType
  );
}

export function savingsAccounts(context: ToolContext): ToolOutput {
  const output = new ToolOutput("savings_accounts", context);
  const views = savingsViews(context);
  output.line("[savings_accounts] name | product | provider | balance | principal | earnings | monthly contributions | expected return");
  for (const view of views) {
    const estimate = estimateSavingsWithdrawal(view.balance, view.details ?? {});
    output.fact(`balance.${view.id}`, round2(view.balance), { currency: view.currency, entityType: "account", entityId: view.id, kind: "stored" });
    output.line(
      `${view.name} | ${productLabel(view)} | ${view.draft?.providerName || "-"} | ${money(view.balance, view.currency)} | ${money(estimate.principal, view.currency)} | ${money(estimate.earnings, view.currency)} | ${money(view.numbers.monthlyContribution + view.numbers.employerMonthlyContribution, view.currency)} | ${view.numbers.expectedAnnualReturnRate}%`,
    );
    output.card({ kind: "account", id: view.id });
  }
  if (!views.length) output.line("no savings accounts");
  return output;
}

export function savingsProductDetails(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("savings_product_details", context);
  const view = findSavings(context, output, args);
  if (!view) return output;
  const n = view.numbers;
  const draft = view.draft;
  output.line(`[savings_product_details] ${view.name}: balance ${money(view.balance, view.currency)}`);
  if (!draft?.isDetailed) {
    output.line("simple savings account without product details").missingData("product details (return, fees, tax)");
    output.card({ kind: "account", id: view.id });
    return output;
  }
  output.line(
    `product ${productLabel(view)}${draft.providerName ? `, provider ${draft.providerName}` : ""}; contribution mode ${draft.contributionMode}`,
    `contributed principal ${money(n.contributedPrincipal, view.currency)}; monthly personal ${money(n.monthlyContribution, view.currency)}, employer ${money(n.employerMonthlyContribution, view.currency)}`,
    `expected annual return ${n.expectedAnnualReturnRate}% (stored assumption)`,
    `liquidity ${draft.liquidity}${draft.liquidity === "notice" ? `, ${n.withdrawalNoticeDays} days notice` : ""}; start ${draft.startDate || "-"}, maturity ${draft.maturityDate || "-"}`,
    `fees: management ${n.annualManagementFeeRate}%/yr, contribution ${n.contributionFeeRate}%, performance ${n.performanceFeeRate}% of earnings, early withdrawal ${n.earlyWithdrawalFeeRate}%`,
    `tax: ${draft.taxTreatment} on ${draft.taxBasis}${draft.taxJurisdiction ? ` (${draft.taxJurisdiction})` : ""}, estimated rate ${n.estimatedTaxRate}%, tax-free allowance ${money(n.taxFreeAllowance, view.currency)}`,
  );
  if (draft.notes) output.line(`notes: ${draft.notes.slice(0, 160)}`);
  output.card({ kind: "account", id: view.id });
  return output;
}

/** Monthly compounding of balance plus contributions, net of stored fees. */
export function projectSavings(
  balance: number,
  months: number,
  annualReturn: number,
  managementFee: number,
  monthlyContribution: number,
  contributionFee: number,
) {
  const monthlyRate = Math.pow(Math.max(0, 1 + (annualReturn - managementFee) / 100), 1 / 12) - 1;
  let value = Math.max(balance, 0);
  let contributed = 0;
  for (let month = 0; month < months; month++) {
    const deposit = monthlyContribution * (1 - contributionFee / 100);
    value = value * (1 + monthlyRate) + deposit;
    contributed += monthlyContribution;
  }
  return { value, contributed, growth: value - Math.max(balance, 0) - contributed };
}

export function savingsProjection(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("savings_projection", context);
  const view = findSavings(context, output, args);
  if (!view) return output;
  const months = args.months ?? 12;
  const n = view.numbers;
  const contribution = args.contribution ?? n.monthlyContribution + n.employerMonthlyContribution;
  const scenarios = [
    { name: `stored return ${n.expectedAnnualReturnRate}%`, rate: n.expectedAnnualReturnRate },
    { name: "zero return", rate: 0 },
    { name: `lower return ${Math.max(0, n.expectedAnnualReturnRate - 2)}%`, rate: Math.max(0, n.expectedAnnualReturnRate - 2) },
  ];
  output.line(
    `[savings_projection] ${view.name}: PROJECTION over ${months} months from current balance ${money(view.balance, view.currency)} (stored), contributions ${money(contribution, view.currency)}/month${args.contribution !== undefined ? " (scenario override)" : ""}, management fee ${n.annualManagementFeeRate}%/yr, contribution fee ${n.contributionFeeRate}%`,
    "scenario | projected balance | contributed | growth after fees",
  );
  for (const scenario of scenarios) {
    const result = projectSavings(view.balance, months, scenario.rate, n.annualManagementFeeRate, contribution, n.contributionFeeRate);
    output.fact(`projected.${scenario.rate}`, round2(result.value), { currency: view.currency, kind: "projection" });
    output.line(`${scenario.name} | ${result.value.toFixed(2)} | ${result.contributed.toFixed(2)} | ${result.growth.toFixed(2)}`);
  }
  if (!view.draft?.isDetailed)
    output.warn("no product details stored; return and fees are assumed 0");
  output.assume("monthly compounding at (annual return - management fee); taxes not deducted");
  output.card({ kind: "account", id: view.id });
  return output;
}

export function savingsWithdrawalEstimate(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("savings_withdrawal_estimate", context);
  const view = findSavings(context, output, args);
  if (!view) return output;
  const amount = args.amount !== undefined ? Math.min(args.amount, view.balance) : view.balance;
  // Uses the app's own estimator; the model never reproduces this math.
  const estimate = estimateSavingsWithdrawal(amount, {
    ...(view.details ?? {}),
    contributedPrincipal:
      view.balance > 0 ? view.numbers.contributedPrincipal * (amount / view.balance) : 0,
  });
  const cur = view.currency;
  output.fact("net", round2(estimate.estimatedNetWithdrawal), { currency: cur, entityType: "account", entityId: view.id });
  output.line(
    `[savings_withdrawal_estimate] ${view.name}, withdrawing ${money(amount, cur)}: principal ${money(estimate.principal, cur)}, earnings ${money(estimate.earnings, cur)}, performance fee ${money(estimate.performanceFee, cur)}, early withdrawal fee ${money(estimate.earlyWithdrawalFee, cur)}, estimated tax ${money(estimate.estimatedTax, cur)}, estimated net ${money(estimate.estimatedNetWithdrawal, cur)}`,
  );
  if (view.draft?.liquidity === "locked" || view.draft?.liquidity === "retirement")
    output.warn(`this product is ${view.draft.liquidity}; withdrawal may not be allowed before ${view.draft.maturityDate || "maturity"}`);
  output.assume("estimate uses the stored fee and tax assumptions of the product");
  output.card({ kind: "account", id: view.id });
  return output;
}

export function savingsFeeAnalysis(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("savings_fee_analysis", context);
  const views = args.id || args.account ? [findSavings(context, output, args)].filter((view): view is SavingsView => !!view) : savingsViews(context);
  let total = 0;
  output.line("[savings_fee_analysis] account | management/yr | contribution fees/yr | performance fee on expected earnings/yr | total/yr");
  for (const view of views) {
    const n = view.numbers;
    const management = Math.max(view.balance, 0) * (n.annualManagementFeeRate / 100);
    const contribution = (n.monthlyContribution + n.employerMonthlyContribution) * 12 * (n.contributionFeeRate / 100);
    const performance = Math.max(view.balance, 0) * (n.expectedAnnualReturnRate / 100) * (n.performanceFeeRate / 100);
    const sum = management + contribution + performance;
    const converted = context.convert(sum, view.currency);
    if (converted !== null) total += converted;
    output.line(`${view.name} | ${management.toFixed(2)} | ${contribution.toFixed(2)} | ${performance.toFixed(2)} | ${money(sum, view.currency)}`);
    output.card({ kind: "account", id: view.id });
  }
  output.fact("yearlyTotal", round2(total), { currency: context.currency });
  output.line(`total estimated yearly fees ${money(total, context.currency)} (from stored rates)`);
  if (!views.length) output.line("no savings accounts");
  return output;
}

export function contributionAnalysis(context: ToolContext, args: ChatToolArgs): ToolOutput {
  const output = new ToolOutput("contribution_analysis", context);
  const view = findSavings(context, output, args);
  if (!view) return output;
  const n = view.numbers;
  const monthly = n.monthlyContribution + n.employerMonthlyContribution;
  const income = mean(context.completedMonths(6).map((month) => month.income));
  const personal = context.convert(n.monthlyContribution, view.currency);
  const yearly = projectSavings(view.balance, 12, n.expectedAnnualReturnRate, n.annualManagementFeeRate, monthly, n.contributionFeeRate);
  const without = projectSavings(view.balance, 12, n.expectedAnnualReturnRate, n.annualManagementFeeRate, 0, 0);
  output.line(
    `[contribution_analysis] ${view.name}: personal ${money(n.monthlyContribution, view.currency)}/month, employer ${money(n.employerMonthlyContribution, view.currency)}/month (${monthly > 0 ? Math.round((n.employerMonthlyContribution / monthly) * 100) : 0}% from employer), ${money(monthly * 12, view.currency)}/year`,
    `personal contribution rate: ${income > 0 && personal !== null ? `${((personal / income) * 100).toFixed(1)}% of average income` : "n/a"}`,
    `12-month projection: ${money(yearly.value, view.currency)} with contributions vs ${money(without.value, view.currency)} without (difference ${money(yearly.value - without.value, view.currency)})`,
  );
  output.card({ kind: "account", id: view.id });
  return output;
}

