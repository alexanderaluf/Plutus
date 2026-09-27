import { parse, unparse } from "papaparse";

import { i18n } from "@/localization/i18n";

import type { JsonObject, JsonValue } from "../model/json";
import { isJsonObject } from "../model/json";

type TransactionCsvRow = {
  uuid: string;
  name: string;
  amount: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  account: string;
  category: string;
  user: string;
  tags: string;
  extra: string;
};

const CSV_FIELDS = [
  "uuid",
  "name",
  "amount",
  "type",
  "createdAt",
  "updatedAt",
  "description",
  "account",
  "category",
  "user",
  "tags",
] as const;

function asText(value: JsonValue | undefined) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function transactionsToCsv(transactions: JsonObject[]) {
  const rows: TransactionCsvRow[] = transactions.map((transaction) => {
    const extra = Object.fromEntries(
      Object.entries(transaction).filter(
        ([key]) => !CSV_FIELDS.includes(key as (typeof CSV_FIELDS)[number]),
      ),
    );

    return {
      uuid: asText(transaction.uuid),
      name: asText(transaction.name),
      amount: asText(transaction.amount),
      type: asText(transaction.type),
      createdAt: asText(transaction.createdAt),
      updatedAt: asText(transaction.updatedAt),
      description: asText(transaction.description),
      account: asText(transaction.account),
      category: asText(transaction.category),
      user: asText(transaction.user),
      tags: JSON.stringify(transaction.tags ?? []),
      extra: JSON.stringify(extra),
    };
  });

  return unparse(rows, { escapeFormulae: true, newline: "\n" });
}

function parseJsonValue(value: string, fallback: JsonValue): JsonValue {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return fallback;
  }
}

export function transactionsFromCsv(csv: string): JsonObject[] {
  const result = parse<TransactionCsvRow>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    throw new Error(
      i18n.t("errors.backup.csvParse", {
        message: result.errors[0].message,
      }),
    );
  }

  const now = new Date().toISOString();
  return result.data.map((row, index) => {
    const amount = Number(row.amount);
    if (!row.name?.trim() || !Number.isFinite(amount)) {
      throw new Error(i18n.t("errors.backup.csvRow", { row: index + 2 }));
    }

    const extraValue = parseJsonValue(row.extra, {});
    const extra = isJsonObject(extraValue) ? extraValue : {};

    return {
      ...extra,
      uuid: row.uuid || `transaction-${Date.now()}-${index}`,
      name: row.name.trim(),
      amount,
      type: Number.isFinite(Number(row.type)) ? Number(row.type) : 0,
      createdAt: row.createdAt || now,
      updatedAt: row.updatedAt || now,
      description: row.description || "",
      account: row.account || null,
      category: row.category || null,
      user: row.user || null,
      tags: parseJsonValue(row.tags, []),
    };
  });
}
