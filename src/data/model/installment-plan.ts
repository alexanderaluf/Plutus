import type { JsonObject } from "./json";

/** Plans spread a purchase over at most six years of monthly payments. */
export const MAX_INSTALLMENTS = 72;

/** Counts offered as one-tap choices in the editor. */
export const QUICK_INSTALLMENT_COUNTS = [3, 6, 10, 12, 18, 24, 36] as const;

/**
 * A purchase paid in equal monthly installments (Israeli "תשלומים"). It lives
 * on a recurring record: `installmentCount` payments add up to
 * `installmentTotal`, in the record's own currency. When `holdsCredit` is set
 * and the payer is a credit card, the part not yet charged holds that card's
 * credit limit until it is charged.
 */
export type InstallmentPlan = {
  count: number;
  total: number;
  holdsCredit: boolean;
};

export function isInstallmentCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_INSTALLMENTS
  );
}

export function readInstallmentPlan(record: JsonObject): InstallmentPlan | null {
  const count = record.installmentCount;
  const total = record.installmentTotal;
  if (!isInstallmentCount(count)) return null;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0)
    return null;
  return { count, total, holdsCredit: record.holdsCredit === true };
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Equal installments rounded down to the cent. The first one absorbs the
 * rounding difference, as card issuers do: 1,000 in 3 is 333.34 + 333.33 + 333.33.
 */
export function installmentAmounts(total: number, count: number) {
  const regular = Math.floor((total / count) * 100 + 1e-7) / 100;
  return { first: cents(total - regular * (count - 1)), regular };
}

/** The amount charged for occurrence `index` (0-based) of the plan. */
export function installmentAmount(plan: InstallmentPlan, index: number) {
  const { first, regular } = installmentAmounts(plan.total, plan.count);
  return index === 0 ? first : regular;
}

/** What is still to be charged after `resolved` installments (processed or skipped). */
export function installmentRemaining(plan: InstallmentPlan, resolved: number) {
  const done = Math.max(0, Math.min(plan.count, Math.floor(resolved)));
  if (done >= plan.count) return 0;
  if (done === 0) return plan.total;
  return cents(
    installmentAmounts(plan.total, plan.count).regular * (plan.count - done),
  );
}
