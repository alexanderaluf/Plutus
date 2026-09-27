export type TransactionTone = "emerald" | "blue" | "amber" | "rose";

export type Transaction = {
  id: string;
  merchant: string;
  description: string;
  category: string;
  categoryId: string;
  occurredAt: string;
  occurredAtIso: string;
  amount: number;
  absoluteAmount: number;
  currencyCode: string;
  accountAmount: number;
  accountCurrencyCode: string;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateFetchedAt: string | null;
  exchangeRateSource: string | null;
  type: 0 | 1 | 2;
  icon: string;
  iconPath: string | null;
  color: string;
  tone: TransactionTone;
  accountId: string;
  accountName: string;
  destinationAccountId: string;
  destinationAccountName: string;
  budgetName: string;
  labelName: string;
  loanName: string;
  placeName: string;
  personName: string;
  receiptPath: string | null;
};

export type BudgetCategory = {
  id: string;
  label: string;
  spent: number;
  limit: number;
  color: string;
};

export type PaymentCardDetails = {
  issuer: string;
  tier: string;
  cardholder: string;
  lastFour: string;
  expiresAt: string;
  balance: number;
  brand: "visa" | "mastercard" | "amex";
};
