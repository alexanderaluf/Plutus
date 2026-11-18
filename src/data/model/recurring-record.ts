import type { BackupDocument } from "./backup-document";
import {
  belongsToProfile,
  identity,
  references,
} from "./category-record";
import {
  installmentAmount,
  installmentAmounts,
  isInstallmentCount,
  readInstallmentPlan,
} from "./installment-plan";
import type { JsonObject } from "./json";

export const RECURRING_PERIODS = [
  "Daily",
  "Weekly",
  "Fortnightly",
  "Monthly",
  "Quarterly",
  "Biannually",
  "Yearly",
] as const;
export type RecurringPeriod = (typeof RECURRING_PERIODS)[number];
export type RecurringDraft = {
  name: string;
  amount: string;
  currencyCode: string;
  type: 0 | 1;
  startAt: string;
  endAt: string | null;
  period: RecurringPeriod;
  automatic: boolean;
  account: string;
  category: string;
  budget: string;
  label: string;
  place: string;
  person: string;
  description: string;
  icon: string;
  iconPath: string | null;
  color: string;
  reminderDays: number | null;
  /** Monthly installments the purchase is spread over; null when it is not a plan. */
  installmentCount: number | null;
  /** The full purchase price, as typed, while `installmentCount` is set. */
  installmentTotal: string;
  /** The not-yet-charged part holds the paying credit card's limit. */
  holdsCredit: boolean;
};
export function recurringDefaults(now = new Date()): RecurringDraft {
  return {
    name: "",
    amount: "",
    currencyCode: "USD",
    type: 0,
    startAt: now.toISOString(),
    endAt: null,
    period: "Monthly",
    automatic: false,
    account: "",
    category: "",
    budget: "",
    label: "",
    place: "",
    person: "",
    description: "",
    icon: "credit-card",
    iconPath: null,
    color: "#70d2eb",
    reminderDays: null,
    installmentCount: null,
    installmentTotal: "",
    holdsCredit: false,
  };
}
export function normalizeRecurringRecord(record: JsonObject): JsonObject {
  // Never activate imported schedules implicitly. Foreign formats remain intact.
  return {
    automatic: false,
    archived: false,
    reminderDays: null,
    endAt: null,
    nextIndex: 0,
    scheduleRevision: 0,
    occurrences: [],
    installmentCount: null,
    installmentTotal: null,
    holdsCredit: false,
    ...record,
  };
}
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function wallTime(date: Date) {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function isRecurringPeriod(value: unknown): value is RecurringPeriod {
  return RECURRING_PERIODS.includes(value as RecurringPeriod);
}
export function occurrenceDate(record: JsonObject, index: number): Date | null {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !isRecurringPeriod(record.period)
  )
    return null;
  // An installment plan ends after its last installment, whatever its end date says.
  const plan = readInstallmentPlan(record);
  if (plan && index >= plan.count) return null;
  const anchor = new Date(String(record.scheduleStart ?? record.startAt ?? ""));
  if (!Number.isFinite(anchor.getTime())) return null;
  const result = new Date(anchor);
  const days = { Daily: 1, Weekly: 7, Fortnightly: 14 }[
    record.period as "Daily" | "Weekly" | "Fortnightly"
  ];
  if (days) result.setDate(anchor.getDate() + index * days);
  else {
    const months = { Monthly: 1, Quarterly: 3, Biannually: 6, Yearly: 12 }[
      record.period as "Monthly" | "Quarterly" | "Biannually" | "Yearly"
    ];
    result.setDate(1);
    result.setMonth(anchor.getMonth() + index * months);
    result.setDate(
      Math.min(
        anchor.getDate(),
        new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate(),
      ),
    );
  }
  if (!Number.isFinite(result.getTime())) return null;
  if (
    typeof record.endAt === "string" &&
    localDateKey(result) > localDateKey(new Date(record.endAt))
  )
    return null;
  return result;
}
/** The amount charged for occurrence `index`: the record amount, or that installment. */
export function recurringOccurrenceAmount(record: JsonObject, index: number) {
  const plan = readInstallmentPlan(record);
  return plan ? installmentAmount(plan, index) : Number(record.amount ?? 0);
}
export function nextOccurrence(record: JsonObject) {
  return occurrenceDate(record, Number(record.nextIndex ?? 0));
}
/** How many unrecorded occurrences are due by `now`, including missed ones. */
export function dueOccurrenceCount(record: JsonObject, now: Date, limit = 1000) {
  if (record.archived === true) return 0;
  const start = Number(record.nextIndex ?? 0);
  let count = 0;
  while (count < limit) {
    const date = occurrenceDate(record, start + count);
    if (!date || date > now) break;
    count++;
  }
  return count;
}
export function occurrenceKey(record: JsonObject) {
  return `recurring:${identity(record)}:${Number(record.scheduleRevision ?? 0)}:${Number(record.nextIndex ?? 0)}`;
}
export function recurringOwner(document: BackupDocument, record: JsonObject) {
  const account = document.accounts.find((a) => references(a, record.account));
  const owner = document.users.find((u) =>
    references(u, record.user ?? account?.user),
  );
  return owner ? identity(owner) : null;
}
export function recurringCurrency(document: BackupDocument, profileId: string) {
  const owner = document.users.find((u) => references(u, profileId));
  const code = String(owner?.currency ?? "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}
export function saveRecurring(
  document: BackupDocument,
  draft: RecurringDraft,
  id: string,
  profileId: string,
  now: string,
  editing = false,
): BackupDocument {
  const existing = document.recurrings.find((r) => identity(r) === id);
  if (!id || (editing && !existing) || (!editing && existing))
    throw new Error(
      "This recurring payment has changed. Reopen it and try again.",
    );
  if (existing && !belongsToProfile(document, existing, profileId))
    throw new Error("This payment belongs to another profile.");
  if (!draft.name.trim() || draft.name.trim().length > 100)
    throw new Error("Enter a name of up to 100 characters.");
  const installments = draft.installmentCount !== null;
  if (installments && !isInstallmentCount(draft.installmentCount))
    throw new Error("Choose between 1 and 72 monthly installments.");
  if (installments && draft.type !== 0)
    throw new Error("Installments are available for expenses only.");
  const entered = Number(
    (installments ? draft.installmentTotal : draft.amount).replace(",", "."),
  );
  if (!Number.isFinite(entered) || entered <= 0 || entered > 1e12)
    throw new Error(
      "Enter an amount greater than zero and no more than 1 trillion.",
    );
  const plan = installments
    ? { count: draft.installmentCount!, total: entered }
    : null;
  const amount = plan
    ? installmentAmounts(plan.total, plan.count).regular
    : entered;
  if (amount <= 0)
    throw new Error("Each installment must be at least 0.01.");
  // A plan is always monthly; its end follows from the number of installments.
  if (plan) draft = { ...draft, period: "Monthly", endAt: null };
  if (!isRecurringPeriod(draft.period) || ![0, 1].includes(draft.type))
    throw new Error("Select a valid frequency and payment type.");
  if (!/^[A-Z]{3}$/.test(draft.currencyCode))
    throw new Error("Select a currency.");
  if (draft.reminderDays !== null && ![0, 1, 2, 7].includes(draft.reminderDays))
    throw new Error("Choose a valid reminder.");
  const start = new Date(draft.startAt);
  if (
    !Number.isFinite(start.getTime()) ||
    (draft.endAt &&
      (!Number.isFinite(Date.parse(draft.endAt)) ||
        localDateKey(new Date(draft.endAt)) < localDateKey(start)))
  )
    throw new Error("The end date must be on or after the start date.");
  const account = document.accounts.find((a) => references(a, draft.account));
  if (!account || !belongsToProfile(document, account, profileId))
    throw new Error("Select an account in this profile.");
  const relations = [
    ["categories", draft.category],
    ["budgets", draft.budget],
    ["labels", draft.label],
    ["places", draft.place],
    ["peoples", draft.person],
  ] as const;
  for (const [collection, value] of relations) {
    if (!value) continue;
    const related = document[collection].find((r) => references(r, value));
    if (!related || !belongsToProfile(document, related, profileId))
      throw new Error(
        "A selected record is no longer available in this profile.",
      );
    if (collection === "categories" && related.type !== draft.type)
      throw new Error("Select a category that matches this payment type.");
  }
  const changedSchedule =
    !!existing &&
    (existing.startAt !== draft.startAt || existing.period !== draft.period);
  const history = Array.isArray(existing?.occurrences)
    ? existing.occurrences
    : [];
  // Payments already recorded or skipped on this schedule count as paid
  // installments, so a plan can't have fewer installments than that. A new
  // start or frequency begins a revised schedule that counts from zero.
  const resolved = changedSchedule ? 0 : Number(existing?.nextIndex ?? 0) || 0;
  if (plan && plan.count < resolved)
    throw new Error(
      `${resolved} payments are already recorded. Choose at least ${resolved} installments.`,
    );
  if (
    changedSchedule &&
    history.some(
      (h) =>
        typeof h === "object" &&
        h !== null &&
        !Array.isArray(h) &&
        String(h.scheduledAt) >= start.toISOString(),
    )
  )
    throw new Error(
      "A revised schedule must start after the last processed or skipped payment.",
    );
  const record: JsonObject = {
    ...normalizeRecurringRecord(existing ?? {}),
    ...draft,
    uuid: existing?.uuid ?? id,
    user: profileId,
    name: draft.name.trim(),
    amount,
    startAt: start.toISOString(),
    scheduleStart:
      !existing || changedSchedule
        ? wallTime(start)
        : (existing.scheduleStart ?? wallTime(start)),
    nextIndex: changedSchedule ? 0 : (existing?.nextIndex ?? 0),
    scheduleRevision:
      Number(existing?.scheduleRevision ?? 0) + (changedSchedule ? 1 : 0),
    installmentCount: plan?.count ?? null,
    installmentTotal: plan?.total ?? null,
    holdsCredit: !!plan && draft.holdsCredit && account.accountType === "card",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (plan) {
    const last = occurrenceDate({ ...record, endAt: null }, plan.count - 1);
    record.endAt = last ? last.toISOString() : null;
  }
  return {
    ...document,
    recurrings: existing
      ? document.recurrings.map((r) => (r === existing ? record : r))
      : [...document.recurrings, record],
  };
}
export function completeOccurrence(
  document: BackupDocument,
  record: JsonObject,
  status: "processed" | "skipped",
  now: string,
  transactionId: string | null,
): BackupDocument {
  const due = nextOccurrence(record);
  if (!due) throw new Error("This schedule has ended.");
  const entry = {
    key: occurrenceKey(record),
    scheduledAt: due.toISOString(),
    status,
    recordedAt: now,
    transactionId,
    amount: recurringOccurrenceAmount(record, Number(record.nextIndex ?? 0)),
    currencyCode: record.currencyCode ?? "USD",
    type: record.type ?? 0,
  };
  return {
    ...document,
    recurrings: document.recurrings.map((r) =>
      identity(r) === identity(record)
        ? {
            ...r,
            nextIndex: Number(r.nextIndex ?? 0) + 1,
            updatedAt: now,
            occurrences: [
              ...(Array.isArray(r.occurrences) ? r.occurrences : []),
              entry,
            ],
          }
        : r,
    ),
  };
}
export function skipRecurring(
  document: BackupDocument,
  id: string,
  expectedKey: string,
  profileId: string,
  now: string,
) {
  const record = document.recurrings.find((r) => identity(r) === id);
  if (
    !record ||
    !belongsToProfile(document, record, profileId) ||
    record.archived === true
  )
    throw new Error("This payment is no longer active.");
  if (occurrenceKey(record) !== expectedKey) return document;
  return completeOccurrence(document, record, "skipped", now, null);
}
