// Standalone, deterministic fixture generation. Never imported by application code.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const ts = require("typescript");

process.env.TZ = "Asia/Jerusalem";
const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "src");
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts
    .transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replace(
      /require\("@\/([^\"]+)"\)/g,
      (_, relative) =>
        `require(${JSON.stringify(path.join(sourceRoot, relative))})`,
    );
  module._compile(compiled, filename);
};

const model = (name) =>
  require(path.join(sourceRoot, "data/model", name + ".ts"));
const { createDefaultBackup } = model("default-backup");
const { normalizeBackupDocument, parseBackupDocument } =
  model("normalize-backup");
const { saveCategory, categoryFamily, identity, belongsToProfile } =
  model("category-record");
const { addAccountToDocument } = model("account-record");
const { createDefaultSavingsDetails } = model("savings-account");
const { budgetDefaults, saveBudget } = model("budget-record");
const {
  recurringDefaults,
  saveRecurring,
  occurrenceDate,
  occurrenceKey,
  completeOccurrence,
} = model("recurring-record");
const {
  createTransactionDraft,
  saveTransaction,
  saveTransactionTemplate,
  transactionDraftFromRecord,
  deleteTransaction,
} = model("transaction-record");
const { settleDueCardPayments } = model("card-payment");
const { parseExchangeRates, storeExchangeRates, convertCurrency } =
  model("exchange-rate");
const { createJsonBackupDocument } = require(
  path.join(sourceRoot, "data/backup/document-export.ts"),
);
const { transactionsToCsv, transactionsFromCsv } = require(
  path.join(sourceRoot, "data/backup/csv-backup.ts"),
);
const { selectBudgets } = require(
  path.join(sourceRoot, "data/selectors/budget-selectors.ts"),
);
const { selectRecurrings, selectRecurringEvents } = require(
  path.join(sourceRoot, "data/selectors/recurring-selectors.ts"),
);
const { MATERIAL_ROUNDED_FILLED_ICONS } = require(
  path.join(sourceRoot, "shared/icons/material-rounded-filled-icons.ts"),
);

const icons = new Map(
  MATERIAL_ROUNDED_FILLED_ICONS.map((item) => [item.name, item.pathData]),
);
const AS_OF = "2026-09-16T09:00:00.000Z";
const START = "2026-03-31T09:00:00.000Z";
const MONTHS = [
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
];
const main = uuid("profile-personal"),
  business = uuid("profile-business"),
  travel = uuid("profile-travel");
function uuid(name) {
  const bytes = crypto
    .createHash("sha1")
    .update("plutus-device-test-v1:" + name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
let colorIndex = 0;
const colors = new Set();
function color() {
  for (;;) {
    const hue = ((colorIndex++ * 137.508) % 360) / 60;
    const saturation = 0.57 + (colorIndex % 3) * 0.08;
    const lightness = 0.47 + (colorIndex % 4) * 0.055;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs((hue % 2) - 1)),
      m = lightness - c / 2;
    const rgb = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ][Math.floor(hue)];
    const value =
      "#" +
      rgb
        .map((v) =>
          Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
    if (!colors.has(value)) {
      colors.add(value);
      return value;
    }
  }
}
function visual(name) {
  assert(icons.has(name), `Unknown installed Material icon: ${name}`);
  return {
    icon: `material:${name}`,
    iconPath: icons.get(name),
    color: color(),
  };
}
function stamp(month, day, hour = 8, minute = 0) {
  return new Date(
    `${month}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`,
  ).toISOString();
}
let document = createDefaultBackup();
document.users = [
  [main, "QA Personal — ILS", "ILS", "Israeli Shekel", "₪", "person"],
  [business, "QA Freelance — USD", "USD", "US Dollar", "$", "business_center"],
  [travel, "QA Travel — EUR", "EUR", "Euro", "€", "luggage"],
].map(([id, name, currency, currencyName, currencySymbol, icon], index) => ({
  uuid: id,
  name,
  currency,
  currencyName,
  currencySymbol,
  isSelected: index === 0,
  ...visual(icon),
  createdAt: START,
  updatedAt: AS_OF,
}));
document._local = {
  ...document._local,
  selectedProfileId: main,
  mainCurrency: "ILS",
  dataMode: "restored",
  appLanguage: "en",
  themeMode: "system",
  dateFormat: "DD/MM/YYYY",
  weekStartDay: 0,
  monthStartDay: 1,
  exportedAt: AS_OF,
  onboardingCompletedAt: START,
  backupResponsibilityAcceptedAt: START,
  localStorageAcceptedAt: START,
};
for (const c of document.categories) {
  colors.add(c.color);
  Object.assign(c, { createdAt: START, updatedAt: START, transactions: [] });
}
const categories = new Map(
  document.categories.map((c) => [
    String(c.uuid).replace("category-", ""),
    c.uuid,
  ]),
);
const categoryIcons = new Set(document.categories.map((c) => c.icon));
function category(key, name, icon, parent = null, type = 0, owner = main) {
  assert(
    !categoryIcons.has(`material:${icon}`),
    `Duplicate category icon: ${icon}`,
  );
  const id = uuid("category-" + key);
  document = saveCategory(
    document,
    {
      name,
      description: `Synthetic device-test category: ${name}. Exercise editing, filtering, icons, colors, and parent totals.`,
      type,
      parentId: parent ? categories.get(parent) : null,
      ...visual(icon),
      isDefault: false,
    },
    id,
    owner,
    START,
  );
  document.categories.at(-1).transactions = [];
  categories.set(key, id);
  categoryIcons.add(`material:${icon}`);
  return id;
}
category("digital", "Digital life & subscriptions", "devices");
category("pets", "Pets & animal care", "pets");
category("giving", "Gifts, charity & community", "volunteer_activism");
category("freelance", "Freelance & side income", "work", null, 1);
category("refunds", "Refunds & reimbursements", "assignment_return", null, 1);
category("transfers", "Transfers between my accounts", "sync_alt", null, 2);
const specs = [
  ["fresh-food", "Fresh fruit & vegetables", "nutrition", "groceries"],
  [
    "supermarket",
    "Supermarket & household staples",
    "shopping_basket",
    "groceries",
  ],
  ["bakery", "Bakery & bread", "bakery_dining", "groceries"],
  [
    "specialty-food",
    "Specialty & international groceries",
    "storefront",
    "groceries",
  ],
  ["coffee", "Coffee & tea", "local_cafe", "food"],
  ["restaurants", "Restaurants & dining out", "table_restaurant", "food"],
  ["takeaway", "Takeaway & delivery", "takeout_dining", "food"],
  ["work-lunch", "Lunch at work", "lunch_dining", "food"],
  ["fuel", "Petrol & charging", "local_gas_station", "car"],
  ["parking", "Parking & tolls", "local_parking", "car"],
  ["car-service", "Car service & repairs", "car_repair", "car"],
  ["car-insurance", "Car insurance", "car_crash", "car"],
  ["bus", "Bus & light rail", "directions_bus", "travel"],
  ["trains", "Train tickets", "train", "travel"],
  ["taxi", "Taxi & rideshare", "local_taxi", "travel"],
  ["flights", "Flights & baggage", "flight_takeoff", "travel"],
  ["hotels", "Hotels & weekend stays", "hotel", "travel"],
  ["clothing", "Clothes & accessories", "checkroom", "shopping"],
  ["electronics", "Electronics & gadgets", "computer", "shopping"],
  ["furniture", "Furniture & homeware", "chair", "shopping"],
  ["books", "Books & learning material", "menu_book", "education"],
  ["courses", "Courses & certifications", "cast_for_education", "education"],
  ["school-supplies", "School supplies", "draw", "education"],
  ["movies", "Cinema & film nights", "movie", "entertainment"],
  ["concerts", "Concerts & live shows", "theater_comedy", "entertainment"],
  ["games", "Games & hobbies", "casino", "entertainment"],
  ["pharmacy", "Medicine & pharmacy", "medication", "health"],
  ["dentist", "Dentist & dental care", "dentistry", "health"],
  ["doctor", "Doctor & appointments", "medical_services", "health"],
  ["fitness", "Fitness classes & equipment", "fitness_center", "health"],
  ["electricity", "Electricity", "bolt", "utilities"],
  ["water", "Water bill", "water_drop", "utilities"],
  ["gas", "Cooking gas", "propane_tank", "utilities"],
  ["maintenance", "Home maintenance", "handyman", "housing"],
  ["home-insurance", "Home insurance", "shield", "housing"],
  ["property-tax", "Municipal tax", "location_city", "housing"],
  ["monthly-rent", "Monthly apartment rent", "home_work", "rent"],
  ["bank-fees", "Bank & account fees", "account_balance", "bills"],
  ["pet-food", "Pet food & treats", "cruelty_free", "pets"],
  ["vet", "Veterinary care", "healing", "pets"],
  ["pet-supplies", "Pet accessories", "sound_detection_dog_barking", "pets"],
  ["gifts", "Birthday & family gifts", "featured_seasonal_and_gifts", "giving"],
  ["charity", "Charitable donations", "favorite", "giving"],
  ["community", "Community events", "diversity_3", "giving"],
  ["misc", "Unplanned small purchases", "category", "others"],
  ["salary-base", "Monthly salary", "badge", "salary", 1],
  ["salary-bonus", "Performance bonus", "workspace_premium", "salary", 1],
  ["salary-overtime", "Overtime payments", "more_time", "salary", 1],
  ["consulting", "Consulting invoices", "psychology", "freelance", 1],
  [
    "design-work",
    "Design & development invoices",
    "design_services",
    "freelance",
    1,
  ],
  ["royalties", "Royalties & licensing", "copyright", "freelance", 1],
  ["dividends", "Investment dividends", "monitoring", "investments", 1],
  ["interest", "Interest earned", "percent", "savings", 1],
  [
    "expense-refund",
    "Expense reimbursements",
    "currency_exchange",
    "refunds",
    1,
  ],
  [
    "purchase-refund",
    "Returned-purchase refunds",
    "keyboard_return",
    "refunds",
    1,
  ],
  ["cashback", "Credit-card cashback", "credit_card_heart", "refunds", 1],
  ["bank-transfer", "Bank-to-bank transfer", "swap_horiz", "transfers", 2],
  ["save-transfer", "Savings contribution", "move_down", "transfers", 2],
  ["cash-transfer", "Cash withdrawal", "atm", "transfers", 2],
];
for (const [key, name, icon, parent, type = 0] of specs) {
  assert(categories.has(parent), `Missing reference-format parent: ${parent}`);
  category(key, name, icon, parent, type);
}
const services = [
  ["Spotify Premium", 39.9, "headphones", 2],
  ["Netflix Standard", 54.9, "live_tv", 4],
  ["YouTube Premium", 31.9, "smart_display", 6],
  ["Disney+", 44.9, "castle", 8],
  ["Apple Music", 21.9, "music_note", 10],
  ["iCloud+", 11.9, "cloud", 12],
  ["Google One", 19.9, "cloud_done", 14],
  ["Dropbox Plus", 45, "folder", 16],
  ["Notion Plus", 38, "note_alt", 18],
  ["Todoist Pro", 18, "checklist", 20],
  ["Adobe Photography", 74, "photo_camera", 22],
  ["Canva Pro", 49, "palette", 24],
  ["GitHub Pro", 15, "code", 26],
  ["ChatGPT Plus", 76, "smart_toy", 28],
  ["Duolingo Super", 34, "translate", 3],
  ["Headspace", 29, "self_improvement", 5],
  ["Strava", 32, "directions_run", 7],
  ["Gym membership", 199, "exercise", 9],
  ["Mobile data plan", 59, "signal_cellular_alt", 11],
  ["Home internet", 119, "wifi", 13],
];
services.forEach(([name, , icon], i) =>
  category(`subscription-${i}`, name + " subscription", icon, "digital"),
);
category(
  "business-sales",
  "Client invoice payments",
  "request_quote",
  null,
  1,
  business,
);
category(
  "business-costs",
  "Freelance operating costs",
  "point_of_sale",
  null,
  0,
  business,
);
category(
  "travel-expense",
  "European trip spending",
  "explore",
  null,
  0,
  travel,
);
category(
  "travel-income",
  "Travel fund replenishment",
  "payments",
  null,
  1,
  travel,
);

const accounts = new Map();
const opening = {};
function account(key, name, kind, balance, icon, owner = main, changes = {}) {
  const id = uuid("account-" + key),
    currency = owner === business ? "USD" : owner === travel ? "EUR" : "ILS";
  const savings = {
    ...createDefaultSavingsDetails(),
    isDetailed: true,
    providerName: "QA Savings Institution",
    contributedPrincipal: "15000",
    expectedAnnualReturnRate: "4.25",
    startDate: "2026-04-01",
    annualManagementFeeRate: "0.3",
    estimatedTaxRate: "25",
    taxJurisdiction: "IL",
    notes: "Synthetic values for the withdrawal estimator.",
  };
  document = addAccountToDocument(
    document,
    {
      name,
      accountType: kind,
      amount: String(balance),
      accountNumber: kind === "bank" ? "TEST-" + key.toUpperCase() : "",
      currencyCode: currency,
      ...visual(icon),
      isDefault: key === "bank-a" || owner !== main,
      isExcluded: false,
      cardLastFour: "",
      cardCompany: "Visa",
      paymentDay: 10,
      bankName: kind === "bank" ? name : "",
      linkedBankAccountId: null,
      savingsDetails:
        kind === "savings" ? savings : createDefaultSavingsDetails(),
      ...changes,
    },
    owner,
    id,
    START,
  );
  accounts.set(key, id);
  opening[id] = balance;
}
account(
  "bank-a",
  "QA Yahav — Everyday bank",
  "bank",
  45000,
  "account_balance_wallet",
);
account(
  "bank-b",
  "QA Leumi — Household bank",
  "bank",
  16000,
  "assured_workload",
);
account(
  "card-a1",
  "QA Visa — Everyday purchases",
  "card",
  0,
  "credit_card",
  main,
  {
    linkedBankAccountId: accounts.get("bank-a"),
    cardLastFour: "1111",
    cardCompany: "Visa",
    paymentDay: 5,
  },
);
account(
  "card-a2",
  "QA Mastercard — Online shopping",
  "card",
  0,
  "credit_score",
  main,
  {
    linkedBankAccountId: accounts.get("bank-a"),
    cardLastFour: "2222",
    cardCompany: "Mastercard",
    paymentDay: 10,
  },
);
account("card-b1", "QA Amex — Travel & dining", "card", 0, "add_card", main, {
  linkedBankAccountId: accounts.get("bank-b"),
  cardLastFour: "3333",
  cardCompany: "American Express",
  paymentDay: 20,
});
account(
  "card-b2",
  "QA Isracard — Subscriptions",
  "card",
  0,
  "contactless",
  main,
  {
    linkedBankAccountId: accounts.get("bank-b"),
    cardLastFour: "4444",
    cardCompany: "Isracard",
    paymentDay: 31,
  },
);
account("savings", "QA Emergency savings", "savings", 18000, "lock");
account("cash", "QA Cash wallet", "cash", 700, "money");
account(
  "business-cash",
  "QA Freelance USD wallet",
  "cash",
  1000,
  "attach_money",
  business,
);
account("travel-cash", "QA Travel EUR wallet", "cash", 1200, "euro", travel, {
  isExcluded: true,
});

for (const [collection, names, icon] of [
  [
    "labels",
    [
      "Essential",
      "Optional",
      "Work",
      "Family",
      "Holiday",
      "Tax deductible",
      "Subscription",
      "Refund",
      "Cash",
      "Large purchase",
      "Weekend",
      "QA edge case",
    ],
    "label",
  ],
  [
    "places",
    [
      "Tel Aviv supermarket",
      "Jerusalem cafe",
      "Haifa station",
      "Home office",
      "Neighborhood pharmacy",
      "Online checkout",
      "Eilat hotel",
      "City gym",
      "Community center",
      "Berlin bookshop",
    ],
    "location_on",
  ],
  [
    "peoples",
    [
      "Dana Cohen (QA)",
      "Noam Levi (QA)",
      "Maya Rosen (QA)",
      "Sam Taylor (QA)",
      "Employer (QA)",
      "Freelance client (QA)",
      "Landlord (QA)",
      "Pet clinic (QA)",
    ],
    "group",
  ],
])
  document[collection] = names.map((name, i) => ({
    uuid: uuid(`${collection}-${i}`),
    name,
    user: main,
    description: `Synthetic ${collection} selector entry ${i + 1}.`,
    ...visual(icon),
    createdAt: START,
    updatedAt: START,
    transactions: [],
  }));

const budgets = new Map();
function budget(key, name, amount, icon, keys, changes = {}) {
  const id = uuid("budget-" + key);
  document = saveBudget(
    document,
    {
      ...budgetDefaults(),
      name,
      amount: String(amount),
      currencyCode: "ILS",
      categories: keys.map((k) => categories.get(k)),
      includeSubcategories: true,
      cycleDay: "1",
      showOnHome: true,
      notes: `QA budget: ${name}. Inspect all six historical periods and edit its scope.`,
      ...visual(icon),
      ...changes,
    },
    id,
    START,
  );
  budgets.set(key, id);
}
budget("groceries", "Groceries & household essentials", 2600, "grocery", [
  "groceries",
]);
budget("dining", "Dining & coffee — deliberately tight", 180, "ramen_dining", [
  "food",
]);
budget("digital", "Digital subscriptions", 1500, "subscriptions", ["digital"]);
budget(
  "transport",
  "Transport & car costs",
  1800,
  "commute",
  ["travel", "car"],
  {
    accounts: [accounts.get("card-a1"), accounts.get("card-b1")],
    rolling: true,
  },
);
budget(
  "health",
  "Health & pet care",
  1600,
  "health_metrics",
  ["health", "pets"],
  { showOnHome: false },
);
budget(
  "learning",
  "Learning & development",
  850,
  "auto_stories",
  ["education"],
  { budgetMode: "Manual" },
);
budget("overall", "Overall yearly expense plan", 180000, "donut_large", [], {
  budgetType: "Overall",
  period: "Yearly",
  accounts: [...accounts]
    .filter(([k]) => !k.endsWith("-cash"))
    .map(([, v]) => v),
});
budget(
  "income",
  "Monthly salary & freelance target",
  22000,
  "trending_up",
  ["salary", "freelance", "refunds"],
  { transactionType: 1 },
);
budget("weekly", "Weekly entertainment", 420, "event", ["entertainment"], {
  period: "Weekly",
  showOnHome: false,
});
budget("daily", "Daily coffee cap", 25, "coffee_maker", ["coffee"], {
  period: "Daily",
  showOnHome: false,
});
budget(
  "past-trip",
  "Summer holiday — completed",
  4200,
  "beach_access",
  ["travel"],
  {
    period: "Custom",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    showOnHome: false,
  },
);
budget("future-trip", "Autumn holiday — upcoming", 8000, "forest", ["travel"], {
  period: "Custom",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  showOnHome: false,
});
budget(
  "saving-transfers",
  "Savings contributions",
  1800,
  "account_tree",
  ["save-transfer"],
  { transactionType: 2, accounts: [accounts.get("bank-a")], showOnHome: false },
);
budget(
  "cycle-31",
  "Utilities — month-end cycle",
  950,
  "calendar_month",
  ["utilities"],
  { cycleDay: "31", rolling: true, showOnHome: false },
);

// Imported supplementary collections are preserved for backup/relationship tests.
for (const [collection, names, icon] of [
  ["assets", ["QA Laptop", "QA Bicycle", "QA Home equipment"], "inventory_2"],
  [
    "goals",
    ["Emergency fund", "Winter holiday", "New laptop", "Education fund"],
    "flag",
  ],
  ["loans", ["QA Car loan", "QA Family loan"], "real_estate_agent"],
  [
    "achievements",
    ["First transaction", "Five months tracked", "Budget review completed"],
    "trophy",
  ],
])
  document[collection] = names.map((name, i) => ({
    uuid: uuid(`${collection}-${i}`),
    name,
    user: main,
    amount: (i + 1) * 1500,
    targetAmount: (i + 1) * 6000,
    currencyCode: "ILS",
    account: accounts.get("bank-a"),
    description: `Synthetic ${collection} backup-preservation record.`,
    ...visual(icon),
    createdAt: START,
    updatedAt: AS_OF,
    transactions: [],
  }));
document.billSplitters = [
  {
    uuid: uuid("split-dinner"),
    name: "QA Shared dinner",
    amount: 240,
    currencyCode: "ILS",
    user: main,
    participants: [
      uuid("split-person-0"),
      uuid("split-person-1"),
      uuid("split-person-2"),
    ],
    transactions: [],
    createdAt: START,
    updatedAt: AS_OF,
  },
];
document.billParticipants = document.peoples.slice(0, 3).map((p, i) => ({
  uuid: uuid(`split-person-${i}`),
  name: p.name,
  person: p.uuid,
  billSplitter: uuid("split-dinner"),
  amount: 80,
  paid: i === 0,
  user: main,
  createdAt: START,
  updatedAt: AS_OF,
}));

const events = [];
const expenseLeaves = specs.filter((s) => (s[4] ?? 0) === 0).map((s) => s[0]);
const incomeLeaves = specs.filter((s) => s[4] === 1).map((s) => s[0]);
const mainSpendingAccounts = [
  "card-a1",
  "card-a2",
  "card-b1",
  "card-b2",
  "bank-a",
  "bank-b",
  "cash",
];
function draftEvent(key, month, day, changes, owner = main) {
  const when = stamp(month, day, changes.hour ?? 8, changes.minute ?? 0);
  events.push({
    key,
    when,
    owner,
    draft: {
      ...createTransactionDraft(changes.type ?? 0),
      currencyCode:
        owner === business ? "USD" : owner === travel ? "EUR" : "ILS",
      accountCurrencyCode:
        owner === business ? "USD" : owner === travel ? "EUR" : "ILS",
      occurredAt: when,
      ...changes,
    },
  });
}
function budgetFor(categoryKey) {
  const parent = specs.find((s) => s[0] === categoryKey)?.[3];
  return (
    budgets.get(
      {
        groceries: "groceries",
        food: "dining",
        education: "learning",
        health: "health",
        pets: "health",
        travel: "transport",
        car: "transport",
      }[parent] ?? "",
    ) ?? ""
  );
}
MONTHS.forEach((month, m) => {
  const maxDay = m === 5 ? 16 : new Date(2026, m + 4, 0).getDate();
  for (let i = 0; i < 200; i++) {
    const income = i % 10 === 0,
      key = (income ? incomeLeaves : expenseLeaves)[
        Math.floor(i / (income ? 10 : 1)) %
          (income ? incomeLeaves : expenseLeaves).length
      ];
    const cat = document.categories.find((c) => c.uuid === categories.get(key));
    const day = 1 + ((i * 7 + m * 3) % maxDay);
    const accountKey = income
      ? i % 20 === 0
        ? "bank-a"
        : "bank-b"
      : mainSpendingAccounts[(i + m) % mainSpendingAccounts.length];
    const amount =
      key === "salary-base"
        ? 15500 + m * 125
        : key === "monthly-rent"
          ? 4300
          : income
            ? Number((250 + ((i * 29 + m * 101) % 2300) + 0.5).toFixed(2))
            : Number(
                (8 + ((i * 17 + m * 13) % 240) + (i % 100) / 100).toFixed(2),
              );
    draftEvent(`regular-${month}-${i}`, month, day, {
      type: income ? 1 : 0,
      name: `${cat.name} · ${String(i + 1).padStart(3, "0")}`,
      amount: String(amount),
      accountId: accounts.get(accountKey),
      categoryId: cat.uuid,
      budgetId: income ? budgets.get("income") : budgetFor(key),
      labelId: document.labels[i % document.labels.length].uuid,
      placeId: document.places[(i + m) % document.places.length].uuid,
      personId: document.peoples[i % document.peoples.length].uuid,
      loanId: i % 91 === 0 ? document.loans[0].uuid : "",
      hour: 7 + (i % 3),
      minute: i % 60,
      description: `QA ${month}, item ${i + 1}. ${cat.name}. Synthetic receipt-free ${income ? "income" : "expense"}; account ${accountKey}. Search tokens: ${["essential", "family", "work", "weekend"][i % 4]}. ${i % 23 === 0 ? 'Multilingual note: קניות לבית · кофе и книги · café ☕.\nSecond line: test wrapping, comma, and quoted "merchant".' : "Test editing amount, date, category and related selectors."}`,
    });
  }
  for (const [index, name, source, target, value, key] of [
    [
      0,
      "Move money to household bank",
      "bank-a",
      "bank-b",
      3500,
      "bank-transfer",
    ],
    [
      1,
      "Monthly emergency savings contribution",
      "bank-a",
      "savings",
      1500,
      "save-transfer",
    ],
    [
      2,
      "Cash withdrawal for daily purchases",
      "bank-b",
      "cash",
      6000,
      "cash-transfer",
    ],
  ])
    draftEvent(
      `transfer-${month}-${index}`,
      month,
      Math.min(3 + index * 5, maxDay),
      {
        type: 2,
        name,
        amount: String(value),
        accountId: accounts.get(source),
        destinationAccountId: accounts.get(target),
        categoryId: categories.get(key),
        budgetId:
          key === "save-transfer" ? budgets.get("saving-transfers") : "",
        description:
          "Transfer: verify it appears on both accounts and is excluded from expense/income totals.",
      },
    );
  for (let i = 0; i < 12; i++) {
    const owner = i < 6 ? business : travel,
      income = i % 3 === 0;
    draftEvent(
      `aux-${month}-${i}`,
      month,
      1 + ((i * 2) % maxDay),
      {
        type: income ? 1 : 0,
        name: income
          ? "QA secondary-profile income"
          : "QA secondary-profile purchase",
        amount: String(income ? 850 + i * 10 : 15 + i * 7.45),
        accountId: accounts.get(
          owner === business ? "business-cash" : "travel-cash",
        ),
        categoryId: categories.get(
          owner === business
            ? income
              ? "business-sales"
              : "business-costs"
            : income
              ? "travel-income"
              : "travel-expense",
        ),
        description:
          "Profile isolation: this record must be visible only in its owning profile.",
      },
      owner,
    );
  }
  draftEvent(`fx-${month}`, month, Math.min(15, maxDay), {
    name: "QA USD software purchase paid from ILS bank",
    amount: "49.99",
    currencyCode: "USD",
    accountCurrencyCode: "ILS",
    exchangeRate: 3.7,
    exchangeRateDate: `${month}-01`,
    exchangeRateFetchedAt: stamp(month, 1),
    exchangeRateSource: "QA synthetic fixed rate",
    accountId: accounts.get("bank-a"),
    categoryId: categories.get("electronics"),
    description:
      "Cross-currency history: USD 49.99, ILS account conversion at synthetic rate 3.7.",
  });
  draftEvent(`tiny-${month}`, month, Math.min(16, maxDay), {
    name: "QA precision test — one agora",
    amount: "0.01",
    accountId: accounts.get("cash"),
    categoryId: categories.get("misc"),
    labelId: document.labels.at(-1).uuid,
    description:
      "Smallest positive ILS amount; verify formatting and edit/delete reversibility.",
  });
});

services.forEach(([name, amount, icon, day], i) => {
  const id = uuid("recurring-subscription-" + i),
    startAt = stamp("2026-04", day);
  document = saveRecurring(
    document,
    {
      ...recurringDefaults(new Date(startAt)),
      name,
      amount: String(amount),
      currencyCode: "ILS",
      startAt,
      account: accounts.get(mainSpendingAccounts[i % 4]),
      category: categories.get(`subscription-${i}`),
      budget: budgets.get("digital"),
      label: document.labels[6].uuid,
      description: `QA monthly subscription ${i + 1}. Five complete months of processed payments, plus September when due. Synthetic plan price.`,
      ...visual(icon),
      automatic: i % 2 === 0,
      reminderDays: [null, 0, 1, 2, 7][i % 5],
    },
    id,
    main,
    START,
  );
  const record = document.recurrings.at(-1);
  for (let index = 0; index < 6; index++) {
    const due = occurrenceDate(record, index);
    if (due <= new Date(AS_OF))
      events.push({
        when: due.toISOString(),
        recurringId: id,
        key: `subscription-${i}-${index}`,
      });
  }
});
// Additional frequencies, skipped history, archived history, and a pending manual payment.
for (const [key, name, period, icon, type, categoryKey, amount] of [
  [
    "weekly",
    "QA Weekly fitness class",
    "Weekly",
    "sports_gymnastics",
    0,
    "fitness",
    45,
  ],
  [
    "fortnightly",
    "QA Fortnightly consulting retainer",
    "Fortnightly",
    "edit_document",
    1,
    "consulting",
    1250,
  ],
  [
    "quarterly",
    "QA Quarterly insurance",
    "Quarterly",
    "verified_user",
    0,
    "home-insurance",
    420,
  ],
  [
    "half-year",
    "QA Six-month learning pass",
    "Biannually",
    "school",
    0,
    "courses",
    600,
  ],
  [
    "yearly",
    "QA Annual domain registration",
    "Yearly",
    "language",
    0,
    "subscription-12",
    85,
  ],
  ["daily", "QA Daily transit pass", "Daily", "tram", 0, "bus", 8],
]) {
  const id = uuid("recurring-" + key),
    startAt = stamp("2026-04", 1);
  document = saveRecurring(
    document,
    {
      ...recurringDefaults(new Date(startAt)),
      name,
      period,
      type,
      amount: String(amount),
      currencyCode: "ILS",
      startAt,
      account: accounts.get("bank-a"),
      category: categories.get(categoryKey),
      ...visual(icon),
      automatic: false,
      description:
        "QA frequency, calendar navigation, paid/skipped history, and manual-payment fixture.",
    },
    id,
    main,
    START,
  );
  const record = document.recurrings.at(-1);
  for (let index = 0; index < 200; index++) {
    const due = occurrenceDate(record, index);
    if (due > new Date(AS_OF)) break;
    events.push({
      key: `frequency-${key}-${index}`,
      when: due.toISOString(),
      recurringId: id,
      skip:
        (key === "weekly" && index % 7 === 3) ||
        (key === "daily" && index % 11 === 7),
    });
  }
}
const archivedId = uuid("recurring-archived"),
  archivedStart = stamp("2026-04", 7);
document = saveRecurring(
  document,
  {
    ...recurringDefaults(new Date(archivedStart)),
    name: "QA Archived magazine subscription",
    amount: "29",
    currencyCode: "ILS",
    startAt: archivedStart,
    endAt: stamp("2026-08", 7),
    account: accounts.get("card-a2"),
    category: categories.get("books"),
    ...visual("newspaper"),
  },
  archivedId,
  main,
  START,
);
for (let i = 0; i < 5; i++)
  events.push({
    key: `archived-${i}`,
    when: occurrenceDate(document.recurrings.at(-1), i).toISOString(),
    recurringId: archivedId,
  });
const pendingId = uuid("recurring-pending");
document = saveRecurring(
  document,
  {
    ...recurringDefaults(new Date(stamp("2026-09", 12))),
    name: "QA Pending manual donation — Pay or Skip",
    amount: "75",
    currencyCode: "ILS",
    startAt: stamp("2026-09", 12),
    account: accounts.get("bank-a"),
    category: categories.get("charity"),
    ...visual("heart_plus"),
    description:
      "Intentionally overdue and manual: test Pay, Skip, edit, and archive.",
  },
  pendingId,
  main,
  START,
);

events.sort(
  (a, b) => a.when.localeCompare(b.when) || a.key.localeCompare(b.key),
);
let cursor = 0;
for (
  let day = new Date(2026, 3, 1, 12);
  day <= new Date(AS_OF);
  day.setDate(day.getDate() + 1)
) {
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  while (cursor < events.length && new Date(events[cursor].when) <= end) {
    const event = events[cursor++];
    if (event.recurringId) {
      const record = document.recurrings.find(
          (r) => r.uuid === event.recurringId,
        ),
        key = occurrenceKey(record);
      if (event.skip)
        document = completeOccurrence(
          document,
          record,
          "skipped",
          event.when,
          null,
        );
      else {
        document = saveTransaction(
          document,
          {
            ...createTransactionDraft(record.type),
            name: record.name,
            amount: String(record.amount),
            currencyCode: "ILS",
            accountCurrencyCode: "ILS",
            accountId: record.account,
            categoryId: record.category,
            budgetId: record.budget,
            labelId: record.label,
            description: record.description,
            occurredAt: event.when,
          },
          key,
          main,
          event.when,
        );
        Object.assign(document.transactions.at(-1), {
          recurring: record.uuid,
          recurringOccurrenceKey: key,
          scheduledAt: event.when,
          processedAt: event.when,
          originalAmount: record.amount,
          originalCurrencyCode: "ILS",
          originalExchangeRate: 1,
          originalExchangeRateDate: null,
          originalExchangeRateFetchedAt: null,
          originalExchangeRateSource: null,
        });
        document = completeOccurrence(
          document,
          record,
          "processed",
          event.when,
          key,
        );
      }
    } else
      document = saveTransaction(
        document,
        event.draft,
        uuid("transaction-" + event.key),
        event.owner,
        event.when,
      );
  }
  document = settleDueCardPayments(document, day);
}
assert.equal(cursor, events.length, "All historical events must be simulated");
document.recurrings.find((r) => r.uuid === archivedId).archived = true;
// Export includes searchable metadata and linked references without fictitious media URIs.
for (const tx of document.transactions) {
  const c = document.categories.find((c) => c.uuid === tx.category);
  if (c)
    Object.assign(tx, { icon: c.icon, iconPath: c.iconPath, color: c.color });
}
for (const collection of ["labels", "places", "peoples", "loans", "budgets"]) {
  const key = {
    labels: "label",
    places: "place",
    peoples: "person",
    loans: "loan",
    budgets: "budget",
  }[collection];
  for (const record of document[collection])
    record.transactions = document.transactions
      .filter((t) => t[key] === record.uuid)
      .map((t) => t.uuid);
}
for (let i = 0; i < 12; i++) {
  const sample = document.transactions.find(
    (t) => t.type === i % 3 && t.user === main && !t.cardPaymentPeriod,
  );
  const draft = transactionDraftFromRecord(document, sample.uuid);
  draft.name = `QA Template ${i + 1}: ${sample.type === 0 ? "expense" : sample.type === 1 ? "income" : "transfer"}`;
  document = saveTransactionTemplate(
    document,
    draft,
    uuid("template-" + i),
    main,
    AS_OF,
  );
  Object.assign(document.templates.at(-1), {
    ...visual(
      [
        "receipt",
        "description",
        "swap_vert",
        "star",
        "bookmark",
        "content_copy",
        "post_add",
        "edit_note",
        "note_add",
        "assignment",
        "history",
        "schedule",
      ][i],
    ),
  });
}
const usdValues = {
  ILS: 3.7,
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 147,
  CAD: 1.36,
  AUD: 1.5,
  CHF: 0.88,
};
for (const base of Object.keys(usdValues)) {
  const payload = Object.fromEntries(
    Object.entries(usdValues).map(([code, value]) => [
      code.toLowerCase(),
      value / usdValues[base],
    ]),
  );
  document = storeExchangeRates(
    document,
    parseExchangeRates(
      { date: AS_OF.slice(0, 10), [base.toLowerCase()]: payload },
      base,
      new Date(AS_OF),
    ),
  );
}

document = normalizeBackupDocument(document);
const monthlyCounts = Object.fromEntries(
  MONTHS.map((m) => [
    m,
    document.transactions.filter(
      (t) => String(t.date ?? t.createdAt).startsWith(m) && t.user === main,
    ).length,
  ]),
);
const baselineBudgets = selectBudgets(document, new Date(AS_OF)).map((b) => ({
  id: b.id,
  name: b.name,
  period: b.period,
  status: b.periodStatus,
  tracked: b.tracked,
  limit: b.limit,
  remaining: b.remaining,
  transactionCount: b.transactions.length,
}));
document._testDataset = {
  name: "Plutus comprehensive on-device test standard",
  version: 1,
  seed: "plutus-device-test-v1",
  asOf: AS_OF,
  historyStart: "2026-04-01",
  historyEnd: "2026-09-16",
  completeMonths: MONTHS.slice(0, 5),
  currentMonth: "2026-09",
  referenceFormat: "plutus-2026-09-15T07-07-22-246Z.json",
  synthetic: true,
  description:
    "Five complete months plus current-month activity. All entities are fictional. JSON has no binary attachments. Extra collections test backup preservation; they do not imply implemented UI features.",
  monthlyTransactionCounts: monthlyCounts,
  collectionCounts: Object.fromEntries(
    Object.entries(document)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, v.length]),
  ),
  profiles: { main, business, travel },
  openingBalances: opening,
  expectedAccountBalances: Object.fromEntries(
    document.accounts.map((a) => [a.uuid, a.amount]),
  ),
  budgets: baselineBudgets,
  pendingManualRecurringId: pendingId,
  exchangeRates:
    "Synthetic fixed rates for offline test history, not actual financial rates.",
  knownLimitations: [
    "Receipt/photo/file round trips require adding actual media on device and exporting ZIP; JSON intentionally strips media.",
    "Dates and current-period baselines are fixed at the as-of timestamp; automatic schedules can create new payments after that date.",
    "Supplementary assets/goals/loans/bill-split/achievement collections exercise relationship and backup preservation where their screens are not implemented.",
  ],
};
document = createJsonBackupDocument(document);
document._local.exportedAt = AS_OF;

// Validate the same JSON parser used by import, references, balances, and domain projections.
const serialized = JSON.stringify(document, null, 2) + "\n";
const imported = parseBackupDocument(serialized);
assert.deepEqual(
  imported,
  document,
  "Import normalization must preserve this fixture exactly",
);
for (const [collection, records] of Object.entries(document).filter(([, v]) =>
  Array.isArray(v),
)) {
  assert.equal(
    new Set(records.map(identity)).size,
    records.length,
    `Unique ${collection} identities`,
  );
}
for (const [key, target] of Object.entries({
  user: "users",
  account: "accounts",
  fromAccount: "accounts",
  toAccount: "accounts",
  category: "categories",
  budget: "budgets",
  label: "labels",
  loan: "loans",
  place: "places",
  person: "peoples",
  recurring: "recurrings",
})) {
  const ids = new Set(document[target].map(identity));
  for (const t of document.transactions)
    if (t[key])
      assert(ids.has(String(t[key])), `${key} reference on ${t.uuid}`);
}
for (const c of document.categories)
  if (c.parentId) {
    const parent = document.categories.find((p) => p.uuid === c.parentId);
    assert(parent && parent.type === c.type, "Category parent type");
    assert(
      !categoryFamily(document.categories, c.uuid).has(c.parentId),
      "No category cycles",
    );
  }
for (const t of document.transactions) {
  assert(
    Number.isFinite(t.amount) && t.amount > 0,
    "Positive finite transaction amount",
  );
  assert(
    new Date(t.date) <= new Date(AS_OF),
    "No future historical transactions",
  );
  if (t.category)
    assert.equal(
      document.categories.find((c) => c.uuid === t.category).type,
      t.type,
      "Transaction/category type",
    );
}
for (const a of document.accounts) {
  assert(Number.isFinite(a.amount), "Finite account balance");
  assert.equal(
    new Set(a.transactions).size,
    a.transactions.length,
    "Unique account references",
  );
  assert(
    a.transactions.every((id) =>
      document.transactions.some((t) => t.uuid === id),
    ),
    "Account transaction references",
  );
}
const reconstructed = { ...opening };
for (const t of document.transactions) {
  const amount = t.accountAmount ?? t.amount;
  if (t.cardPaymentPeriod) {
    reconstructed[t.account] += t.uuid.endsWith(":bank") ? -t.amount : t.amount;
  } else if (t.type === 2) {
    reconstructed[t.fromAccount] -= amount;
    reconstructed[t.toAccount] += amount;
  } else reconstructed[t.account] += (t.type === 1 ? 1 : -1) * amount;
  if (t.account)
    assert(
      belongsToProfile(
        document,
        document.accounts.find((a) => a.uuid === t.account),
        t.user,
      ),
      "Account and transaction have the same owner",
    );
}
for (const a of document.accounts)
  assert(
    Math.abs(reconstructed[a.uuid] - a.amount) < 0.000001,
    "Opening balance plus independently reconstructed history matches final balance",
  );
const banks = document.accounts.filter((a) => a.accountType === "bank"),
  cards = document.accounts.filter((a) => a.accountType === "card");
assert.equal(banks.length, 2);
assert.equal(cards.length, 4);
for (const b of banks)
  assert.equal(cards.filter((c) => c.linkedBankAccountId === b.uuid).length, 2);
for (const group of [
  cards.concat(banks),
  document.budgets,
  document.categories,
  document.recurrings,
]) {
  assert.equal(
    new Set(group.map((r) => r.color)).size,
    group.length,
    "Distinct colors per entity group",
  );
  assert.equal(
    new Set(group.map((r) => r.icon)).size,
    group.length,
    "Distinct icons per entity group",
  );
}
for (const count of Object.values(monthlyCounts))
  assert(count >= 200, "At least 200 transactions each month");
for (const r of document.recurrings) {
  const entries = r.occurrences;
  assert.equal(r.nextIndex, entries.length, "Schedule cursor matches history");
  for (const h of entries)
    if (h.status === "processed") {
      const t = document.transactions.find((t) => t.uuid === h.transactionId);
      assert(
        t && t.recurring === r.uuid && t.recurringOccurrenceKey === h.key,
        "Recurring history links to payment",
      );
    }
  if (services.some(([name]) => name === r.name))
    for (const month of MONTHS.slice(0, 5)) {
      assert(
        entries.some(
          (h) => h.status === "processed" && h.scheduledAt.startsWith(month),
        ),
        "Every subscription has five full months of payments",
      );
    }
}
assert(
  selectRecurrings(document, new Date(AS_OF)).every(
    (r) => r.archived || r.valid,
  ),
  "All active recurring schedules valid",
);
assert(
  selectRecurringEvents(
    selectRecurrings(document, new Date(AS_OF)),
    new Date(2026, 7, 1),
    new Date(2026, 8, 1),
  ).length > 20,
  "Recurring calendar exposes history",
);
assert(
  baselineBudgets.some((b) => b.remaining < 0) &&
    baselineBudgets.some((b) => b.remaining > 0),
  "Over and under limit budget cases",
);
assert(
  baselineBudgets.some((b) => b.status === "ended") &&
    baselineBudgets.some((b) => b.status === "upcoming"),
  "Past and upcoming budgets",
);
const regular = document.transactions.find(
  (t) => !t.recurring && !t.cardPaymentPeriod && t.type === 0,
);
const edited = saveTransaction(
  document,
  {
    ...transactionDraftFromRecord(document, regular.uuid),
    amount: String(regular.amount + 1),
  },
  regular.uuid,
  main,
  AS_OF,
  true,
);
assert.equal(
  edited.accounts.find((a) => a.uuid === regular.account).amount,
  Math.round(
    (document.accounts.find((a) => a.uuid === regular.account).amount - 1) *
      1e8,
  ) / 1e8,
  "Editing updates account balance",
);
const deleted = deleteTransaction(document, regular.uuid, main, AS_OF);
assert.equal(
  deleted.transactions.length,
  document.transactions.length - 1,
  "Deleting test transaction",
);
assert.deepEqual(
  createJsonBackupDocument(imported)._testDataset,
  document._testDataset,
  "Unknown test metadata survives export",
);
const csv = transactionsToCsv(document.transactions),
  csvResult = transactionsFromCsv(csv);
assert.equal(
  csvResult.length,
  document.transactions.length,
  "Large CSV round trip retains rows",
);
assert.deepEqual(
  csvResult.map((t) => t.uuid),
  document.transactions.map((t) => t.uuid),
  "CSV preserves all transaction identities in order",
);
for (let i = 0; i < csvResult.length; i++) {
  assert.equal(csvResult[i].amount, document.transactions[i].amount);
  assert.equal(
    csvResult[i].description ?? "",
    document.transactions[i].description ?? "",
  );
  assert.equal(
    csvResult[i].recurringOccurrenceKey,
    document.transactions[i].recurringOccurrenceKey,
  );
}
assert(
  !document._local.attachments.length && !document.images.length,
  "JSON is safely media-free",
);
assert.equal(
  settleDueCardPayments(document, new Date(AS_OF)),
  document,
  "Import at the baseline must not settle a card twice",
);
assert(
  document.recurrings
    .filter((r) => r.automatic && !r.archived)
    .every((r) => occurrenceDate(r, r.nextIndex) > new Date(AS_OF)),
  "No accidental automatic catch-up at the baseline",
);

const out = path.join(root, "test-data/plutus-device-test-2026-09.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serialized);
const summary = {
  file: path.relative(root, out),
  bytes: Buffer.byteLength(serialized),
  sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
  ...document._testDataset.collectionCounts,
  monthlyCounts,
  budgetBaselines: baselineBudgets,
};
fs.writeFileSync(
  path.join(root, "test-data/plutus-device-test-2026-09-summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(
  JSON.stringify({ ...summary, budgetBaselines: undefined }, null, 2),
);
