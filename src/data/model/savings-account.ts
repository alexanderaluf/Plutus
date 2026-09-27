import { i18n } from "@/localization/i18n";

import type { JsonObject, JsonValue } from "./json";

export const SAVINGS_PRODUCT_OPTIONS = [
  {
    value: "fixed_deposit",
    label: "Fixed-term deposit",
    description: "Bank deposit, CD, GIC or Israeli pakam with a maturity date.",
  },
  {
    value: "notice_savings",
    label: "Notice savings",
    description: "Cash savings that requires notice before withdrawal.",
  },
  {
    value: "regular_savings",
    label: "Regular savings",
    description: "Flexible or recurring cash savings.",
  },
  {
    value: "investment_account",
    label: "Investment account",
    description: "Market-linked brokerage, mutual fund or managed portfolio.",
  },
  {
    value: "provident_fund",
    label: "Provident fund / Kupat Gemel",
    description: "Personal or employer-supported long-term investment savings.",
  },
  {
    value: "education_fund",
    label: "Education fund / Keren Hishtalmut",
    description:
      "Tax-advantaged medium-term employee or self-employed savings.",
  },
  {
    value: "pension",
    label: "Pension fund",
    description: "Retirement savings intended to provide future income.",
  },
  {
    value: "employer_retirement",
    label: "Employer retirement plan",
    description:
      "401(k), 403(b), workplace pension, superannuation or similar plan.",
  },
  {
    value: "tax_advantaged",
    label: "Tax-advantaged savings",
    description: "ISA, TFSA, IRA, Roth, PEA or another local tax wrapper.",
  },
  {
    value: "government_bond",
    label: "Government savings bond",
    description: "Government-issued savings bond or certificate.",
  },
  {
    value: "child_education",
    label: "Child or education savings",
    description: "Junior ISA, RESP, 529 or another child-focused plan.",
  },
  {
    value: "health_savings",
    label: "Health savings",
    description: "HSA or another health-purpose savings account.",
  },
  {
    value: "annuity_insurance",
    label: "Annuity or savings insurance",
    description: "Insurance-based savings or future income contract.",
  },
  {
    value: "other",
    label: "Other savings product",
    description: "A product not covered by the standard categories.",
  },
] as const;

export type SavingsProductType =
  (typeof SAVINGS_PRODUCT_OPTIONS)[number]["value"];

export const CONTRIBUTION_MODE_OPTIONS = [
  { value: "lump_sum", label: "One-time deposit" },
  { value: "recurring", label: "Recurring deposit" },
  { value: "employer", label: "Employee + employer" },
  { value: "mixed", label: "One-time + recurring" },
] as const;
export type ContributionMode =
  (typeof CONTRIBUTION_MODE_OPTIONS)[number]["value"];

export const LIQUIDITY_OPTIONS = [
  { value: "flexible", label: "Flexible" },
  { value: "notice", label: "Notice required" },
  { value: "locked", label: "Locked until maturity" },
  { value: "retirement", label: "Retirement access rules" },
] as const;
export type SavingsLiquidity = (typeof LIQUIDITY_OPTIONS)[number]["value"];

export const TAX_TREATMENT_OPTIONS = [
  { value: "tax_exempt", label: "Tax exempt" },
  { value: "flat", label: "Flat rate" },
  { value: "progressive", label: "Progressive / marginal rate" },
  { value: "tax_deferred", label: "Tax deferred until withdrawal" },
  { value: "custom", label: "Other / custom" },
] as const;
export type SavingsTaxTreatment =
  (typeof TAX_TREATMENT_OPTIONS)[number]["value"];

export const TAX_BASIS_OPTIONS = [
  { value: "earnings", label: "Earnings only" },
  { value: "withdrawal", label: "Full withdrawal" },
] as const;
export type SavingsTaxBasis = (typeof TAX_BASIS_OPTIONS)[number]["value"];

export interface SavingsDetailsDraft {
  isDetailed: boolean;
  productType: SavingsProductType;
  providerName: string;
  contributionMode: ContributionMode;
  contributedPrincipal: string;
  monthlyContribution: string;
  employerMonthlyContribution: string;
  expectedAnnualReturnRate: string;
  startDate: string;
  maturityDate: string;
  liquidity: SavingsLiquidity;
  withdrawalNoticeDays: string;
  annualManagementFeeRate: string;
  contributionFeeRate: string;
  performanceFeeRate: string;
  earlyWithdrawalFeeRate: string;
  taxJurisdiction: string;
  taxTreatment: SavingsTaxTreatment;
  taxBasis: SavingsTaxBasis;
  estimatedTaxRate: string;
  taxFreeAllowance: string;
  notes: string;
}

export function createDefaultSavingsDetails(): SavingsDetailsDraft {
  return {
    isDetailed: false,
    productType: "regular_savings",
    providerName: "",
    contributionMode: "lump_sum",
    contributedPrincipal: "",
    monthlyContribution: "",
    employerMonthlyContribution: "",
    expectedAnnualReturnRate: "",
    startDate: "",
    maturityDate: "",
    liquidity: "flexible",
    withdrawalNoticeDays: "",
    annualManagementFeeRate: "",
    contributionFeeRate: "",
    performanceFeeRate: "",
    earlyWithdrawalFeeRate: "",
    taxJurisdiction: "",
    taxTreatment: "flat",
    taxBasis: "earnings",
    estimatedTaxRate: "",
    taxFreeAllowance: "",
    notes: "",
  };
}

function optionalNumber(
  value: string,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const input = value.trim();
  if (!input) return 0;
  if (!/^(?:\d+(?:[.,]\d{1,4})?|[.,]\d{1,4})$/.test(input)) {
    throw new Error(i18n.t("validation.savings.invalidNumber", { label }));
  }
  const parsed = Number(input.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      i18n.t("validation.savings.outOfRange", { label, minimum, maximum }),
    );
  }
  return parsed;
}

function optionalRate(value: string, label: string) {
  return optionalNumber(value, label, 0, 100);
}

function optionalDate(value: string, label: string) {
  const input = value.trim();
  if (!input) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input) ||
    Number.isNaN(new Date(`${input}T00:00:00Z`).getTime())
  ) {
    throw new Error(i18n.t("validation.savings.invalidDate", { label }));
  }
  return input;
}

export function validateSavingsDetails(
  draft: SavingsDetailsDraft,
  balance: number,
) {
  if (!draft.isDetailed) {
    return {
      isDetailed: false,
      productType: "regular_savings",
      providerName: "",
      contributionMode: "lump_sum",
      contributedPrincipal: Math.max(balance, 0),
      monthlyContribution: 0,
      employerMonthlyContribution: 0,
      expectedAnnualReturnRate: 0,
      startDate: null,
      maturityDate: null,
      liquidity: "flexible",
      withdrawalNoticeDays: 0,
      annualManagementFeeRate: 0,
      contributionFeeRate: 0,
      performanceFeeRate: 0,
      earlyWithdrawalFeeRate: 0,
      taxJurisdiction: "",
      taxTreatment: "tax_exempt",
      taxBasis: "earnings",
      estimatedTaxRate: 0,
      taxFreeAllowance: 0,
      notes: "",
    } satisfies JsonObject;
  }
  if (
    !SAVINGS_PRODUCT_OPTIONS.some(
      (option) => option.value === draft.productType,
    )
  )
    throw new Error(i18n.t("validation.savings.product"));
  if (!draft.providerName.trim())
    throw new Error(i18n.t("validation.savings.provider"));
  if (
    !CONTRIBUTION_MODE_OPTIONS.some(
      (option) => option.value === draft.contributionMode,
    )
  )
    throw new Error(i18n.t("validation.savings.contributionMethod"));
  if (!LIQUIDITY_OPTIONS.some((option) => option.value === draft.liquidity))
    throw new Error(i18n.t("validation.savings.withdrawalAccess"));
  if (
    !TAX_TREATMENT_OPTIONS.some((option) => option.value === draft.taxTreatment)
  )
    throw new Error(i18n.t("validation.savings.taxTreatment"));
  if (!TAX_BASIS_OPTIONS.some((option) => option.value === draft.taxBasis))
    throw new Error(i18n.t("validation.savings.taxableAmount"));

  const startDate = optionalDate(
    draft.startDate,
    i18n.t("validation.savings.fields.startDate"),
  );
  const maturityDate = optionalDate(
    draft.maturityDate,
    i18n.t("validation.savings.fields.maturityDate"),
  );
  if (startDate && maturityDate && maturityDate < startDate)
    throw new Error(i18n.t("validation.savings.maturity"));

  const principal = optionalNumber(
    draft.contributedPrincipal,
    i18n.t("validation.savings.fields.contributedPrincipal"),
  );
  const monthlyContribution = optionalNumber(
    draft.monthlyContribution,
    i18n.t("validation.savings.fields.monthlyContribution"),
  );
  const employerMonthlyContribution = optionalNumber(
    draft.employerMonthlyContribution,
    i18n.t("validation.savings.fields.employerMonthlyContribution"),
  );
  const withdrawalNoticeDays = optionalNumber(
    draft.withdrawalNoticeDays,
    i18n.t("validation.savings.fields.withdrawalNoticeDays"),
    0,
    36500,
  );
  const expectedAnnualReturnRate = optionalRate(
    draft.expectedAnnualReturnRate,
    i18n.t("validation.savings.fields.expectedAnnualReturnRate"),
  );
  const annualManagementFeeRate = optionalRate(
    draft.annualManagementFeeRate,
    i18n.t("validation.savings.fields.annualManagementFeeRate"),
  );
  const contributionFeeRate = optionalRate(
    draft.contributionFeeRate,
    i18n.t("validation.savings.fields.contributionFeeRate"),
  );
  const performanceFeeRate = optionalRate(
    draft.performanceFeeRate,
    i18n.t("validation.savings.fields.performanceFeeRate"),
  );
  const earlyWithdrawalFeeRate = optionalRate(
    draft.earlyWithdrawalFeeRate,
    i18n.t("validation.savings.fields.earlyWithdrawalFeeRate"),
  );
  const estimatedTaxRate = optionalRate(
    draft.estimatedTaxRate,
    i18n.t("validation.savings.fields.estimatedTaxRate"),
  );
  const taxFreeAllowance = optionalNumber(
    draft.taxFreeAllowance,
    i18n.t("validation.savings.fields.taxFreeAllowance"),
  );

  if (
    draft.contributionMode !== "lump_sum" &&
    monthlyContribution === 0 &&
    employerMonthlyContribution === 0
  ) {
    throw new Error(i18n.t("validation.savings.monthlyContribution"));
  }
  if (draft.liquidity === "notice" && withdrawalNoticeDays === 0)
    throw new Error(i18n.t("validation.savings.withdrawalNotice"));
  if (draft.taxTreatment !== "tax_exempt" && !draft.taxJurisdiction.trim())
    throw new Error(i18n.t("validation.savings.taxJurisdiction"));
  if (draft.taxTreatment !== "tax_exempt" && estimatedTaxRate === 0)
    throw new Error(i18n.t("validation.savings.taxRate"));

  return {
    isDetailed: true,
    productType: draft.productType,
    providerName: draft.providerName.trim(),
    contributionMode: draft.contributionMode,
    contributedPrincipal: draft.contributedPrincipal.trim()
      ? principal
      : Math.max(balance, 0),
    monthlyContribution,
    employerMonthlyContribution,
    expectedAnnualReturnRate,
    startDate,
    maturityDate,
    liquidity: draft.liquidity,
    withdrawalNoticeDays,
    annualManagementFeeRate,
    contributionFeeRate,
    performanceFeeRate,
    earlyWithdrawalFeeRate,
    taxJurisdiction: draft.taxJurisdiction.trim(),
    taxTreatment: draft.taxTreatment,
    taxBasis: draft.taxBasis,
    estimatedTaxRate,
    taxFreeAllowance,
    notes: draft.notes.trim(),
  } satisfies JsonObject;
}

function text(value: JsonValue | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numericText(value: JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

export function savingsDetailsToDraft(
  value: JsonValue | undefined,
): SavingsDetailsDraft {
  const defaults = createDefaultSavingsDetails();
  if (!value || Array.isArray(value) || typeof value !== "object")
    return defaults;
  const option = <T extends string>(
    candidate: JsonValue | undefined,
    values: readonly T[],
    fallback: T,
  ) =>
    typeof candidate === "string" && values.includes(candidate as T)
      ? (candidate as T)
      : fallback;
  return {
    isDetailed: typeof value.isDetailed === "boolean" ? value.isDetailed : true,
    productType: option(
      value.productType,
      SAVINGS_PRODUCT_OPTIONS.map((item) => item.value),
      defaults.productType,
    ),
    providerName: text(value.providerName),
    contributionMode: option(
      value.contributionMode,
      CONTRIBUTION_MODE_OPTIONS.map((item) => item.value),
      defaults.contributionMode,
    ),
    contributedPrincipal: numericText(value.contributedPrincipal),
    monthlyContribution: numericText(value.monthlyContribution),
    employerMonthlyContribution: numericText(value.employerMonthlyContribution),
    expectedAnnualReturnRate: numericText(value.expectedAnnualReturnRate),
    startDate: text(value.startDate),
    maturityDate: text(value.maturityDate),
    liquidity: option(
      value.liquidity,
      LIQUIDITY_OPTIONS.map((item) => item.value),
      defaults.liquidity,
    ),
    withdrawalNoticeDays: numericText(value.withdrawalNoticeDays),
    annualManagementFeeRate: numericText(value.annualManagementFeeRate),
    contributionFeeRate: numericText(value.contributionFeeRate),
    performanceFeeRate: numericText(value.performanceFeeRate),
    earlyWithdrawalFeeRate: numericText(value.earlyWithdrawalFeeRate),
    taxJurisdiction: text(value.taxJurisdiction),
    taxTreatment: option(
      value.taxTreatment,
      TAX_TREATMENT_OPTIONS.map((item) => item.value),
      defaults.taxTreatment,
    ),
    taxBasis: option(
      value.taxBasis,
      TAX_BASIS_OPTIONS.map((item) => item.value),
      defaults.taxBasis,
    ),
    estimatedTaxRate: numericText(value.estimatedTaxRate),
    taxFreeAllowance: numericText(value.taxFreeAllowance),
    notes: text(value.notes),
  };
}

export type SavingsWithdrawalEstimate = {
  balance: number;
  principal: number;
  earnings: number;
  performanceFee: number;
  earlyWithdrawalFee: number;
  estimatedTax: number;
  estimatedNetWithdrawal: number;
  estimatedAnnualManagementFee: number;
};

export function estimateSavingsWithdrawal(
  balance: number,
  details: JsonObject,
): SavingsWithdrawalEstimate {
  const amount = Math.max(balance, 0);
  const principal = Math.min(
    Math.max(Number(details.contributedPrincipal) || 0, 0),
    amount,
  );
  const earnings = Math.max(amount - principal, 0);
  const rate = (key: string) =>
    Math.min(Math.max(Number(details[key]) || 0, 0), 100) / 100;
  const performanceFee = earnings * rate("performanceFeeRate");
  const earlyWithdrawalFee = amount * rate("earlyWithdrawalFeeRate");
  const taxableBase = details.taxBasis === "withdrawal" ? amount : earnings;
  const allowance = Math.max(Number(details.taxFreeAllowance) || 0, 0);
  const estimatedTax =
    details.taxTreatment === "tax_exempt"
      ? 0
      : Math.max(taxableBase - allowance, 0) * rate("estimatedTaxRate");
  const estimatedAnnualManagementFee = amount * rate("annualManagementFeeRate");
  return {
    balance: amount,
    principal,
    earnings,
    performanceFee,
    earlyWithdrawalFee,
    estimatedTax,
    estimatedNetWithdrawal: Math.max(
      amount - performanceFee - earlyWithdrawalFee - estimatedTax,
      0,
    ),
    estimatedAnnualManagementFee,
  };
}

export function estimateSavingsDraftWithdrawal(
  balance: number,
  draft: SavingsDetailsDraft,
) {
  const numeric = (value: string) => {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return estimateSavingsWithdrawal(balance, {
    contributedPrincipal: draft.contributedPrincipal.trim()
      ? numeric(draft.contributedPrincipal)
      : Math.max(balance, 0),
    performanceFeeRate: numeric(draft.performanceFeeRate),
    earlyWithdrawalFeeRate: numeric(draft.earlyWithdrawalFeeRate),
    taxTreatment: draft.taxTreatment,
    taxBasis: draft.taxBasis,
    estimatedTaxRate: numeric(draft.estimatedTaxRate),
    taxFreeAllowance: numeric(draft.taxFreeAllowance),
    annualManagementFeeRate: numeric(draft.annualManagementFeeRate),
  });
}

export type SavingsAccountSummary = {
  isDetailed: boolean;
  productLabel: string;
  providerName: string;
  principal: number;
  earnings: number;
  estimatedNetWithdrawal: number;
  monthlyContribution: number;
  employerMonthlyContribution: number;
  expectedAnnualReturnRate: number;
  maturityDate: string | null;
  liquidityLabel: string;
  taxJurisdiction: string;
};

export function getSavingsAccountSummary(
  balance: number,
  value: JsonValue | undefined,
): SavingsAccountSummary | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const draft = savingsDetailsToDraft(value);
  const estimate = estimateSavingsWithdrawal(balance, value);
  const product = SAVINGS_PRODUCT_OPTIONS.find(
    (option) => option.value === draft.productType,
  );
  const liquidity = LIQUIDITY_OPTIONS.find(
    (option) => option.value === draft.liquidity,
  );
  const amount = (field: keyof SavingsDetailsDraft) => {
    const parsed = Number(draft[field]);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    isDetailed: draft.isDetailed,
    productLabel: draft.isDetailed
      ? (product?.label ?? "Savings account")
      : "Simple savings",
    providerName: draft.providerName,
    principal: estimate.principal,
    earnings: estimate.earnings,
    estimatedNetWithdrawal: estimate.estimatedNetWithdrawal,
    monthlyContribution: amount("monthlyContribution"),
    employerMonthlyContribution: amount("employerMonthlyContribution"),
    expectedAnnualReturnRate: amount("expectedAnnualReturnRate"),
    maturityDate: draft.maturityDate || null,
    liquidityLabel: liquidity?.label ?? "Access not specified",
    taxJurisdiction: draft.taxJurisdiction,
  };
}
