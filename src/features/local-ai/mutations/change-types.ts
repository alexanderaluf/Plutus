/**
 * The only mutation surface the model can reach. The model asks for a change;
 * trusted code turns that into a reviewable `ChangeProposal`; only the user's
 * tap in the app executes it. Nothing in this file writes data.
 */

export const MUTABLE_ENTITY_TYPES = [
  "transaction",
  "budget",
  "recurring",
  "category",
  "account",
  "goal",
  "loan",
  "asset",
  "template",
  "label",
  "place",
  "person",
  "bill_splitter",
] as const;
export type MutableEntityType = (typeof MUTABLE_ENTITY_TYPES)[number];

export const CHANGE_OPERATIONS = ["create", "update", "delete", "archive"] as const;
export type ChangeOperation = (typeof CHANGE_OPERATIONS)[number];

/** Primitive field values only; nested objects from the model are dropped. */
export type ChangeFieldValue = string | number | boolean | null | string[];
export type ChangeFields = Record<string, ChangeFieldValue>;

export interface PrepareChangeArgs {
  operation: ChangeOperation;
  entityType: MutableEntityType;
  /** Stable id, or the name/description the user used for the record. */
  entityId?: string;
  userProvidedFields?: ChangeFields;
  naturalLanguageReason?: string;
}

export type RecordVisual = { icon: string; iconPath: string | null; color: string };

export type ChangedField = {
  field: string;
  before: ChangeFieldValue;
  after: ChangeFieldValue;
};

export type SideEffect = {
  kind: string;
  description: string;
  affectedEntityIds: string[];
  /** Values for the localized description in the review card. */
  params?: Record<string, string | number>;
};

/** How the review card lets the user adjust a proposed field in place. */
export type EditableField = {
  field: string;
  kind:
    | "text"
    | "amount"
    | "date"
    | "account"
    | "category"
    | "budget"
    | "choice"
    | "toggle";
  value: ChangeFieldValue;
  /** For `choice`: the permitted values. */
  options?: readonly string[];
  /** For `category`: the transaction direction the category must match. */
  categoryType?: 0 | 1 | 2;
  required?: boolean;
};

export interface ChangeProposal {
  proposalId: string;
  operation: ChangeOperation;
  entityType: MutableEntityType;
  entityId?: string;
  entityName: string;
  profileId: string;
  before: Record<string, ChangeFieldValue> | null;
  after: Record<string, ChangeFieldValue> | null;
  changedFields: ChangedField[];
  sideEffects: SideEffect[];
  warnings: string[];
  destructive: boolean;
  /** Requires a typed/held confirmation, e.g. deleting an account. */
  strongConfirmation: boolean;
  editableFields: EditableField[];
  /** The record's own icon and color, as the app shows it. */
  visual?: RecordVisual | null;
  /** Icons for linked records shown in field rows (account, category…). */
  fieldVisuals?: Record<string, RecordVisual>;
  /** The request this proposal was built from; edits re-run it. */
  request: PrepareChangeArgs;
  currentStateFingerprint: string;
  createdAt: string;
  expiresAt: string;
}

export type ProposalStatus =
  | "pending"
  | "executing"
  | "completed"
  | "cancelled"
  | "failed"
  | "stale"
  | "expired";

export interface MutationResult {
  status: "completed" | "cancelled" | "failed" | "stale" | "expired" | "unknown";
  proposalId: string;
  operation?: ChangeOperation;
  entityType?: MutableEntityType;
  entityId?: string;
  entityName?: string;
  /** Final stored values read back after the commit. */
  final?: Record<string, ChangeFieldValue> | null;
  message?: string;
}

export type PrepareChangeResult =
  | { ok: true; proposal: ChangeProposal }
  | {
      ok: false;
      code:
        | "AMBIGUOUS_ENTITY"
        | "ENTITY_NOT_FOUND"
        | "MUTATION_VALIDATION_FAILED"
        | "UNSUPPORTED_OPERATION";
      message: string;
      /** Candidate records when the reference was ambiguous. */
      candidates?: { id: string; name: string }[];
      missingFields?: string[];
    };

function readFieldValue(value: unknown): ChangeFieldValue | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value.trim().slice(0, 500);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value
      .filter((item) => typeof item === "string" || typeof item === "number")
      .slice(0, 50)
      .map((item) => String(item).slice(0, 100));
  return undefined;
}

const ALIASES: Record<string, MutableEntityType> = {
  expense: "transaction",
  income: "transaction",
  transfer: "transaction",
  payment: "transaction",
  subscription: "recurring",
  recurring_payment: "recurring",
  bill: "recurring",
  tag: "label",
  payee: "person",
  people: "person",
  contact: "person",
  debt: "loan",
  bill_split: "bill_splitter",
  split: "bill_splitter",
};

/**
 * Accepts `{operation, entityType, entityId?, fields|userProvidedFields}` from
 * the model. Unknown operations or entity types yield null.
 */
export function sanitizeChangeArgs(value: unknown): PrepareChangeArgs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const operation = String(input.operation ?? input.action ?? "")
    .toLowerCase()
    .trim();
  const rawType = String(input.entityType ?? input.entity ?? input.type ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const entityType = (ALIASES[rawType] ?? rawType) as MutableEntityType;
  const op = (
    operation === "add" || operation === "new"
      ? "create"
      : operation === "edit" || operation === "change" || operation === "modify"
        ? "update"
        : operation === "remove"
          ? "delete"
          : operation
  ) as ChangeOperation;
  if (!CHANGE_OPERATIONS.includes(op)) return null;
  if (!MUTABLE_ENTITY_TYPES.includes(entityType)) return null;
  const rawFields = input.fields ?? input.userProvidedFields ?? input.values ?? {};
  const fields: ChangeFields = {};
  if (rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)) {
    for (const [key, raw] of Object.entries(rawFields as Record<string, unknown>).slice(0, 30)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
      const parsed = readFieldValue(raw);
      if (parsed !== undefined) fields[key] = parsed;
    }
  }
  // The original expense/income wording is a useful default for the type.
  if (entityType === "transaction" && fields.type === undefined) {
    if (rawType === "income") fields.type = "income";
    else if (rawType === "transfer") fields.type = "transfer";
  }
  const entityId = input.entityId ?? input.id ?? input.target;
  return {
    operation: op,
    entityType,
    ...(typeof entityId === "string" || typeof entityId === "number"
      ? { entityId: String(entityId).trim().slice(0, 120) }
      : {}),
    userProvidedFields: fields,
    ...(typeof input.naturalLanguageReason === "string"
      ? { naturalLanguageReason: input.naturalLanguageReason.slice(0, 200) }
      : {}),
  };
}
