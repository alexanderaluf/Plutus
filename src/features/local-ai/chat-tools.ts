import type { BackupDocument } from "@/data/model/backup-document";
import {
  profileCurrency,
  transactionMoney,
} from "@/data/model/transaction-conversion";
import { selectAccounts } from "@/data/selectors/document-selectors";
import { selectBudgets } from "@/data/selectors/budget-selectors";
import {
  createTransactionIndex,
  createTransactionProjector,
} from "@/data/selectors/transaction-selectors";

export type ChatCard =
  | { kind: "transaction"; id: string }
  | { kind: "account"; id: string }
  | { kind: "budget"; id: string };

export type ReadTool =
  "largest_expenses" | "recent_transactions" | "accounts" | "budgets";

/** The model chooses from a fixed set. Only trusted selectors touch private records. */
export function parseReadTools(output: string): ReadTool[] {
  const allowed: ReadTool[] = [
    "largest_expenses",
    "recent_transactions",
    "accounts",
    "budgets",
  ];
  try {
    const parsed: unknown = JSON.parse(
      output.replace(/^```(?:json)?\s*|\s*```$/g, ""),
    );
    if (!parsed || typeof parsed !== "object") return [];
    const requested = (parsed as { tools?: unknown }).tools;
    return Array.isArray(requested)
      ? allowed.filter((tool) => requested.includes(tool))
      : [];
  } catch {
    return [];
  }
}

export function inferReadTools(question: string): ReadTool[] {
  const text = question.toLowerCase();
  const tools: ReadTool[] = [];
  if (
    /(highest|largest|biggest|most expensive|הכי גבוה|הכי גדולה|הוצאה הגדולה|самый большой расход|крупнейший расход)/i.test(
      text,
    )
  )
    tools.push("largest_expenses");
  if (/(recent|latest|last transactions|אחרונ|последн.*транзакц)/i.test(text))
    tools.push("recent_transactions");
  if (/(account|balance|חשבון|יתרה|сч[её]т|баланс)/i.test(text))
    tools.push("accounts");
  if (/(budget|תקציב|бюджет)/i.test(text)) tools.push("budgets");
  return tools;
}

export function runReadTools(
  document: BackupDocument,
  requested: readonly ReadTool[],
  language: string,
) {
  const cards: ChatCard[] = [];
  const facts: Record<string, unknown> = {};
  if (
    requested.includes("largest_expenses") ||
    requested.includes("recent_transactions")
  ) {
    const project = createTransactionProjector(document, language);
    const entries = createTransactionIndex(document);
    const transactions = entries.map(project);
    if (requested.includes("largest_expenses")) {
      const currency = profileCurrency(
        document,
        document._local.selectedProfileId ?? "",
      );
      const comparable = entries
        .map((entry, index) => ({
          transaction: transactions[index],
          converted: transactionMoney(entry.record, currency),
        }))
        .filter((item) => item.transaction.type === 0);
      const expenses = comparable
        .filter((item) => item.converted !== null)
        .sort((a, b) => b.converted!.amount - a.converted!.amount)
        .slice(0, 3);
      facts.largest_expenses = {
        currency,
        excludedWithoutHistoricalRate:
          comparable.length -
          comparable.filter((item) => item.converted !== null).length,
        records: expenses.map(({ transaction, converted }) => ({
          id: transaction.id,
          merchant: transaction.merchant,
          amount: transaction.absoluteAmount,
          currency: transaction.currencyCode,
          comparableAmount: converted!.amount,
          comparableCurrency: currency,
          date: transaction.occurredAt,
        })),
      };
      cards.push(
        ...expenses.map(({ transaction }): ChatCard => ({
          kind: "transaction",
          id: transaction.id,
        })),
      );
    }
    if (requested.includes("recent_transactions")) {
      const recent = transactions.slice(0, 5);
      facts.recent_transactions = recent.map(
        ({ id, merchant, amount, currencyCode, occurredAt }) => ({
          id,
          merchant,
          amount,
          currency: currencyCode,
          date: occurredAt,
        }),
      );
      cards.push(
        ...recent.map(({ id }): ChatCard => ({ kind: "transaction", id })),
      );
    }
  }
  if (requested.includes("accounts")) {
    const accounts = selectAccounts(document).slice(0, 5);
    facts.accounts = accounts.map(({ id, name, balance, currencyCode }) => ({
      id,
      name,
      balance,
      currency: currencyCode,
    }));
    cards.push(
      ...accounts.map(({ id }): ChatCard => ({ kind: "account", id })),
    );
  }
  if (requested.includes("budgets")) {
    const budgets = selectBudgets(document).slice(0, 5);
    facts.budgets = budgets.map(
      ({ id, name, tracked, remaining, currencyCode }) => ({
        id,
        name,
        spent: tracked,
        remaining,
        currency: currencyCode,
      }),
    );
    cards.push(...budgets.map(({ id }): ChatCard => ({ kind: "budget", id })));
  }
  return {
    facts,
    cards: cards.filter(
      (card, index) =>
        cards.findIndex(
          (other) => other.kind === card.kind && other.id === card.id,
        ) === index,
    ),
  };
}

export const CHAT_INSTRUCTION = `You are Plutus, a private financial assistant running on the user's device. Be concise. Never claim to have accessed information you have not been given. For financial record questions, first reply ONLY with JSON: {"tools":["largest_expenses"]}; choose any combination of largest_expenses, recent_transactions, accounts, budgets. If no records are needed, answer in plain text. After receiving TOOL_RESULTS, answer the question in one or two short sentences using only those facts. Do not include JSON in that final answer. Do not invent amounts, currencies, dates, or names. Never ask for passwords.`;
