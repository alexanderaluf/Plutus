import { createDefaultBackup } from "./default-backup";
import { normalizeBackupDocument } from "./normalize-backup";

/** Called only after the user explicitly finishes setup in demo mode. */
export function createDemoBackup(
  profileId: string,
  currency: string,
  now = new Date(),
) {
  const document = createDefaultBackup();
  const timestamp = now.toISOString();
  document.accounts = [
    {
      uuid: "demo-checking",
      name: "Everyday checking",
      accountType: "bank",
      type: 3,
      amount: 6500,
      isDefault: true,
      icon: "bank",
      color: "#70d2eb",
    },
    {
      uuid: "demo-savings",
      name: "Emergency savings",
      isDefault: false,
      accountType: "savings",
      type: 2,
      amount: 12000,
      icon: "piggy-bank",
      color: "#b89cf5",
    },
    {
      uuid: "demo-cash",
      name: "Cash wallet",
      isDefault: false,
      accountType: "cash",
      type: 1,
      amount: 250,
      icon: "wallet",
      color: "#f2c66d",
    },
  ].map((account) => ({
    ...account,
    currencyCode: currency,
    user: profileId,
    createdAt: timestamp,
    updatedAt: timestamp,
    transactions: [],
  }));
  const expenses = [
    ["Weekly groceries", "groceries", 86.4],
    ["Coffee with friends", "food", 18.5],
    ["Train ticket", "travel", 24],
    ["Bookshop", "education", 38],
    ["Movie night", "entertainment", 42],
    ["Electricity", "utilities", 95],
    ["New shoes", "shopping", 120],
    ["Pharmacy", "health", 28],
    ["Lunch", "food", 34],
    ["Rent", "housing", 1400],
  ] as const;
  for (let offset = 0; offset < 90; offset++) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - offset,
      12,
    );
    const [name, category, amount] = expenses[offset % expenses.length];
    document.transactions.push({
      uuid: `demo-expense-${offset}`,
      name,
      category: `category-${category}`,
      amount,
      type: 0,
      currencyCode: currency,
      account: "demo-checking",
      user: profileId,
      tags: [],
      createdAt: date.toISOString(),
      updatedAt: timestamp,
    });
    if (date.getDate() === 10)
      document.transactions.push({
        uuid: `demo-salary-${offset}`,
        name: "Salary",
        category: "category-salary",
        amount: 4800,
        type: 1,
        currencyCode: currency,
        account: "demo-checking",
        user: profileId,
        tags: [],
        createdAt: date.toISOString(),
        updatedAt: timestamp,
      });
  }
  document.accounts = document.accounts.map((account) => ({
    ...account,
    transactions: document.transactions
      .filter((tx) => tx.account === account.uuid)
      .map((tx) => tx.uuid),
  }));
  document.budgets = [
    {
      uuid: "demo-essentials",
      name: "Essentials",
      amount: 2200,
      categories: [
        "category-groceries",
        "category-housing",
        "category-utilities",
      ],
    },
    {
      uuid: "demo-lifestyle",
      name: "Lifestyle",
      amount: 600,
      categories: [
        "category-food",
        "category-shopping",
        "category-entertainment",
      ],
    },
  ].map((budget) => ({
    ...budget,
    user: profileId,
    currencyCode: currency,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  return normalizeBackupDocument(document);
}
