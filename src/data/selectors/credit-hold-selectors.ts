import type { BackupDocument } from "../model/backup-document";
import { identity, references } from "../model/category-record";
import { convertCurrency } from "../model/exchange-rate";
import {
  installmentAmounts,
  installmentRemaining,
  readInstallmentPlan,
} from "../model/installment-plan";
import type { JsonObject, JsonValue } from "../model/json";
import { nextOccurrence, occurrenceDate } from "../model/recurring-record";
import { memoizeForDocument } from "./document-memo";
import { selectExchangeQuote } from "./exchange-rate-selectors";

/** One installment plan that holds part of a credit card's limit. */
export type CreditHold = {
  recurringId: string;
  name: string;
  icon: string;
  iconPath: string | null;
  color: string;
  /** The plan's own currency and amounts. */
  currencyCode: string;
  total: number;
  installmentAmount: number;
  count: number;
  /** Installments already charged (processed or skipped). */
  resolved: number;
  /** Still to be charged, in the plan's currency. */
  remaining: number;
  /** Still to be charged in the card's currency; null without an exchange rate. */
  heldAmount: number | null;
  nextAt: Date | null;
  endsAt: Date | null;
  /** The raw `account` reference, matched against the card's uuid/id. */
  account: JsonValue;
};

function currency(value: JsonValue | undefined, fallback = "USD") {
  const code = String(value ?? fallback).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

/**
 * Every expense installment plan that holds a card's credit limit and still
 * has installments to charge. The installment of the current billing cycle is
 * already part of the card's spending once it is recorded, so a plan holds
 * only what has not been charged yet. Paused (archived) plans still hold the
 * limit: the debt remains until it is paid.
 */
function selectAllCreditHolds(document: BackupDocument, now: Date) {
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return memoizeForDocument(document, `credit-holds:${dayKey}`, () => {
    const holds: CreditHold[] = [];
    for (const record of document.recurrings) {
      const plan = readInstallmentPlan(record);
      if (!plan?.holdsCredit || record.type === 1) continue;
      const card = document.accounts.find(
        (account) =>
          account.accountType === "card" && references(account, record.account),
      );
      if (!card) continue;
      const resolved = Math.max(0, Number(record.nextIndex ?? 0) || 0);
      const remaining = installmentRemaining(plan, resolved);
      if (remaining <= 0) continue;
      const planCurrency = currency(record.currencyCode);
      const cardCurrency = currency(card.currencyCode);
      let heldAmount: number | null = remaining;
      if (planCurrency !== cardCurrency) {
        const quote = selectExchangeQuote(
          document,
          planCurrency,
          cardCurrency,
          now,
        );
        heldAmount = quote
          ? convertCurrency(remaining, quote.rate, cardCurrency)
          : null;
      }
      holds.push({
        recurringId: identity(record),
        name: String(record.name ?? ""),
        icon: String(record.icon ?? "credit-card"),
        iconPath: typeof record.iconPath === "string" ? record.iconPath : null,
        color: /^#[a-f\d]{6}$/i.test(String(record.color))
          ? String(record.color)
          : "#70d2eb",
        currencyCode: planCurrency,
        total: plan.total,
        installmentAmount: installmentAmounts(plan.total, plan.count).regular,
        count: plan.count,
        resolved: Math.min(resolved, plan.count),
        remaining,
        heldAmount,
        nextAt: nextOccurrence(record),
        endsAt: occurrenceDate({ ...record, endAt: null }, plan.count - 1),
        account: record.account ?? null,
      });
    }
    // The plan that frees the limit last comes first.
    return holds.sort(
      (a, b) =>
        (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0) ||
        a.name.localeCompare(b.name),
    );
  });
}

/** Installment plans holding this card's limit, and the total they hold in its currency. */
export function selectCardCreditHolds(
  document: BackupDocument,
  card: JsonObject,
  now = new Date(),
) {
  const items = selectAllCreditHolds(document, now).filter((hold) =>
    references(card, hold.account),
  );
  const total =
    Math.round(
      items.reduce((sum, hold) => sum + (hold.heldAmount ?? 0), 0) * 100,
    ) / 100;
  return { items, total };
}

/** The same holds, looked up by the account id used on screens. */
export function selectAccountCreditHolds(
  document: BackupDocument,
  accountId: string,
  now = new Date(),
) {
  const card = document.accounts.find((account) =>
    references(account, accountId),
  );
  return card && card.accountType === "card"
    ? selectCardCreditHolds(document, card, now)
    : { items: [] as CreditHold[], total: 0 };
}
