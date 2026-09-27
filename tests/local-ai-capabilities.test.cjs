const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const source = ts
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
  module._compile(source, filename);
};

const {
  createLegacyDevelopmentBackup,
} = require("./fixtures/legacy-development-backup.ts");
const {
  normalizeBackupDocument,
  cloneBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const { estimateSavingsWithdrawal } = require("../src/data/model/savings-account.ts");
const { runChatTools, TOOL_RUNNERS } = require("../src/features/local-ai/chat-tools.ts");
const {
  parseToolCalls,
  resolvePeriod,
  sanitizeToolArgs,
} = require("../src/features/local-ai/chat-tool-protocol.ts");
const { CHAT_TOOL_NAMES, toolsInPacks } = require("../src/features/local-ai/tools/tool-catalog.ts");
const { resolveIntent } = require("../src/features/local-ai/intent-router.ts");
const { ProposalStore } = require("../src/features/local-ai/mutations/proposal-store.ts");
const { sanitizeChangeArgs } = require("../src/features/local-ai/mutations/change-types.ts");
const {
  extractChangeRequest,
  runChatTurn,
} = require("../src/features/local-ai/chat-controller.ts");
const { auditAnswerNumbers } = require("../src/features/local-ai/evidence.ts");
const {
  parseTranscript,
  uriToPath,
  validateRecording,
} = require("../src/features/local-ai/voice/voice-audio.ts");
const { voiceReducer } = require("../src/features/local-ai/voice/voice-state.ts");
const { selectFinancialPriorities } = require("../src/features/local-ai/tools/core-tools.ts");
const { ToolContext } = require("../src/features/local-ai/tools/tool-context.ts");

const ME = "profile-me";
const OTHER = "profile-other";
const NOW = new Date(2026, 8, 26, 12, 0, 0);
const iso = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();

function tx(id, name, amount, date, extra = {}) {
  return {
    uuid: id,
    name,
    amount,
    currencyCode: "USD",
    type: 0,
    account: "acc-bank",
    category: "cat-restaurants",
    user: ME,
    date,
    createdAt: date,
    tags: [],
    ...extra,
  };
}

/** Covers every domain: profiles, account kinds, nested categories, FX… */
function richDocument() {
  const base = createLegacyDevelopmentBackup();
  const snapshot = {
    base: "EUR",
    date: "2026-07-01",
    fetchedAt: "2026-07-01T00:00:00.000Z",
    source: "test",
    rates: { EUR: 1, USD: 1.25, ILS: 4 },
  };
  const transactions = [
    tx("t-salary-jul", "Acme Salary", 5000, iso(2026, 7, 10), { type: 1, category: "cat-salary" }),
    tx("t-salary-aug", "Acme Salary", 5000, iso(2026, 8, 10), { type: 1, category: "cat-salary" }),
    tx("t-salary-sep", "Acme Salary", 5000, iso(2026, 9, 10), { type: 1, category: "cat-salary" }),
    tx("t-rest-jul", "Cafe Nero", 40, iso(2026, 7, 15)),
    tx("t-rest-aug", "Cafe Nero", 45, iso(2026, 8, 15)),
    tx("t-rest-aug2", "Cafe Nero", 42, iso(2026, 8, 20)),
    tx("t-rest-sep", "Cafe Nero", 400, iso(2026, 9, 20), { place: "place-tlv", person: "person-alex", label: "label-fun", tags: ["label-fun"] }),
    tx("t-groc-sep", "Supermarket", 120, iso(2026, 9, 21), { category: "cat-groceries" }),
    tx("t-dup-a", "Supermarket", 120, iso(2026, 9, 22, 10), { category: "cat-groceries" }),
    tx("t-card-1", "Online shop", 300, iso(2026, 9, 18), { account: "acc-card", category: "cat-groceries" }),
    tx("t-fx", "Paris hotel", 100, iso(2026, 7, 2), {
      currencyCode: "EUR",
      accountCurrencyCode: "USD",
      accountAmount: 125,
      exchangeRate: 1.25,
      conversionSnapshot: snapshot,
      category: "cat-travel",
    }),
    tx("card-payment:acc-card:2026-09:bank", "Card payment", 200, iso(2026, 9, 10), {
      type: 2,
      category: null,
      fromAccount: "acc-bank",
      toAccount: "acc-card",
      cardPaymentPeriod: "2026-09",
    }),
    tx("card-payment:acc-card:2026-09:bank-dup", "Card payment", 200, iso(2026, 9, 10), {
      type: 2,
      category: null,
      fromAccount: "acc-bank",
      toAccount: "acc-card",
      cardPaymentPeriod: "2026-09",
    }),
    tx("t-uncat", "Mystery", 30, iso(2026, 9, 23), { category: null }),
    tx("t-other", "Secret other profile", 999, iso(2026, 9, 20), { user: OTHER, account: "acc-other" }),
  ];
  return normalizeBackupDocument({
    ...base,
    _local: {
      ...base._local,
      selectedProfileId: ME,
      monthStartDay: 10,
      mainCurrency: "USD",
      attachments: [],
    },
    users: [
      { uuid: ME, name: "Me", currency: "USD", isSelected: true },
      { uuid: OTHER, name: "Other", currency: "USD" },
    ],
    accounts: [
      { uuid: "acc-bank", name: "Checking", accountType: "bank", type: 3, bankName: "Bank", currencyCode: "USD", amount: 3000, isDefault: true, user: ME },
      { uuid: "acc-cash", name: "Wallet", accountType: "cash", type: 1, currencyCode: "USD", amount: 200, user: ME },
      {
        uuid: "acc-savings",
        name: "Pension fund",
        accountType: "savings",
        type: 2,
        currencyCode: "USD",
        amount: 10000,
        user: ME,
        savingsDetails: {
          isDetailed: true,
          productType: "pension",
          providerName: "Fund",
          contributionMode: "employer",
          contributedPrincipal: 8000,
          monthlyContribution: 200,
          employerMonthlyContribution: 300,
          expectedAnnualReturnRate: 5,
          liquidity: "retirement",
          annualManagementFeeRate: 1.5,
          contributionFeeRate: 2,
          performanceFeeRate: 10,
          earlyWithdrawalFeeRate: 3,
          taxTreatment: "flat",
          taxBasis: "earnings",
          estimatedTaxRate: 25,
          taxFreeAllowance: 0,
        },
      },
      {
        uuid: "acc-card",
        name: "Visa",
        accountType: "card",
        type: 0,
        currencyCode: "USD",
        amount: -3500,
        creditLimit: 4000,
        paymentDay: 10,
        cardLastFour: "1234",
        cardCompany: "Visa",
        linkedBankAccountId: "acc-bank",
        lastPaymentPeriod: "2026-09",
        user: ME,
      },
      { uuid: "acc-other", name: "Other bank", accountType: "bank", currencyCode: "USD", amount: 50000, user: OTHER },
    ],
    categories: [
      { uuid: "cat-food", name: "Food", type: 0, user: ME },
      { uuid: "cat-restaurants", name: "Restaurants", type: 0, parentId: "cat-food", user: ME },
      { uuid: "cat-groceries", name: "Groceries", type: 0, parentId: "cat-food", user: ME },
      { uuid: "cat-travel", name: "Travel", type: 0, user: ME },
      { uuid: "cat-salary", name: "Salary", type: 1, user: ME },
    ],
    budgets: [
      {
        uuid: "budget-food",
        name: "Food budget",
        amount: 500,
        currencyCode: "USD",
        transactionType: 0,
        budgetMode: "Automatic",
        budgetType: "Category",
        period: "Monthly",
        categories: ["cat-food"],
        accounts: [],
        includeSubcategories: true,
        cycleDay: 10,
        user: ME,
      },
    ],
    recurrings: [
      {
        uuid: "rec-netflix",
        name: "Netflix",
        amount: 20,
        currencyCode: "USD",
        type: 0,
        period: "Monthly",
        startAt: iso(2026, 1, 1, 9),
        scheduleStart: "2026-10-01T09:00",
        account: "acc-bank",
        category: "cat-restaurants",
        user: ME,
        nextIndex: 0,
      },
      {
        uuid: "rec-salary",
        name: "Acme Salary",
        amount: 5000,
        currencyCode: "USD",
        type: 1,
        period: "Monthly",
        startAt: iso(2026, 10, 10, 9),
        scheduleStart: "2026-10-10T09:00",
        account: "acc-bank",
        category: "cat-salary",
        user: ME,
        nextIndex: 0,
      },
    ],
    goals: [{ uuid: "goal-laptop", name: "Laptop", targetAmount: 5000, currentAmount: 1000, targetDate: "2027-09-26", user: ME }],
    loans: [{ uuid: "loan-car", name: "Car loan", amount: 12000, interestRate: 6, monthlyPayment: 400, dueDate: "2026-10-05", user: ME }],
    assets: [{ uuid: "asset-car", name: "Car", value: 15000, user: ME }],
    labels: [{ uuid: "label-fun", name: "Fun", user: ME }],
    places: [{ uuid: "place-tlv", name: "Tel Aviv", user: ME }],
    peoples: [{ uuid: "person-alex", name: "Alex", phone: "555-0100", email: "alex@example.com", user: ME }],
    billSplitters: [{ uuid: "split-dinner", name: "Dinner", totalAmount: 300, date: "2026-09-01", user: ME }],
    billParticipants: [
      { uuid: "bp-1", splitterId: "split-dinner", personId: "person-alex", shareAmount: 150, paidAmount: 50 },
    ],
    templates: [],
    exchangeRates: [
      { base: "USD", date: "2026-09-25", fetchedAt: "2026-09-25T00:00:00.000Z", source: "test", rates: { USD: 1, EUR: 0.5, ILS: 3.7 } },
    ],
    transactions,
  });
}

const run = (document, name, args = {}, charBudget = 20_000) =>
  runChatTools(document, [{ name, args }], { charBudget, now: NOW });

test("every model-visible read tool has a trusted implementation", () => {
  for (const name of CHAT_TOOL_NAMES) {
    if (name === "prepare_change") continue;
    assert.equal(typeof TOOL_RUNNERS[name], "function", name);
  }
  assert.ok(CHAT_TOOL_NAMES.length >= 60);
  // Packs expose a bounded subset; mutation tools never appear in read packs.
  assert.ok(toolsInPacks(["transactions"]).length <= 14);
  assert.ok(!toolsInPacks(["core", "transactions"]).some((tool) => tool.name === "prepare_change"));
});

test("no read tool changes the document, even with odd arguments", () => {
  const document = richDocument();
  const before = JSON.stringify(document);
  for (const name of CHAT_TOOL_NAMES) {
    if (name === "prepare_change") continue;
    const result = run(document, name, { amount: 1000, account: "Checking", id: "Laptop", query: "Cafe", operation: "reduce_category", category: "Food", merchant: "Cafe" });
    assert.deepEqual(result.failures, [], name);
  }
  assert.equal(JSON.stringify(document), before);
});

test("tools only see the active profile", () => {
  const document = richDocument();
  for (const name of ["search_transactions", "spending_summary", "accounts", "net_worth", "financial_snapshot"]) {
    const { facts } = run(document, name, {});
    assert.ok(!facts.includes("Secret other profile"), name);
    assert.ok(!facts.includes("Other bank"), name);
  }
});

test("financial periods are resolved by code, not the model", () => {
  // The financial month starts on day 10.
  assert.equal(resolvePeriod({ period: "this_month" }, NOW, 10).label, "2026-09-10..2026-10-09");
  assert.equal(resolvePeriod({ period: "this_calendar_month" }, NOW, 10).label, "2026-09-01..2026-09-30");
  assert.equal(resolvePeriod({ period: "last_quarter" }, NOW, 1).label, "2026-04-01..2026-06-30");
  assert.equal(resolvePeriod({ period: "year_to_date" }, NOW, 1).label, "2026-01-01..2026-09-26");
  assert.equal(resolvePeriod({ period: "next_7_days" }, NOW, 1).label, "2026-09-26..2026-10-03");
  assert.equal(
    resolvePeriod({ period: "since_payday" }, NOW, 1, { lastPayday: new Date(2026, 8, 10, 9) }).label,
    "2026-09-10..2026-09-26",
  );
  const { facts } = run(richDocument(), "cash_flow", { period: "since_payday" });
  assert.match(facts, /2026-09-10\.\.2026-09-26 \(since the last salary income\)/);
});

test("spending groups roll subcategories up into their parent", () => {
  const { facts } = run(richDocument(), "spending_summary", { period: "this_month", groupBy: "parent_category" });
  // Restaurants 400 + Groceries 120 + 120 + card 300 = 940 under Food.
  assert.match(facts, /Food \| 940\.00 USD/);
});

test("search paginates with hasMore and a next offset", () => {
  const { facts } = run(richDocument(), "search_transactions", { limit: 2, offset: 1 });
  assert.match(facts, /hasMore true, nextOffset 3/);
});

test("merchant analysis summarizes lifetime and monthly history", () => {
  const { facts } = run(richDocument(), "merchant_analysis", { merchant: "Cafe Nero" });
  assert.match(facts, /lifetime: 4 transactions, total 527\.00 USD/);
  assert.match(facts, /median 43\.50 USD/);
});

test("anomalies and duplicates come from deterministic rules", () => {
  const document = richDocument();
  const unusual = run(document, "unusual_transactions", {}).facts;
  assert.match(unusual, /Cafe Nero.*ABOVE_MERCHANT_MEDIAN/);
  assert.ok(!/fraud/i.test(unusual.replace(/not necessarily wrong or fraudulent/, "")));
  const duplicates = run(document, "duplicate_transaction_candidates", {}).facts;
  assert.match(duplicates, /t-groc-sep|t-dup-a/);
  // Generated card settlements are never reported as duplicates.
  assert.ok(!duplicates.includes("card-payment:"));
});

test("foreign transactions keep the price saved when they were recorded", () => {
  const { facts } = run(richDocument(), "fx_transaction_analysis", { period: "last_12_months" });
  // Saved snapshot: 100 EUR = 125 USD; today's rate (0.5) would give 200.
  assert.match(facts, /EUR \| 1 \| 100\.00 \| 125\.00/);
});

test("savings withdrawal uses the app's estimator", () => {
  const document = richDocument();
  const { facts } = run(document, "savings_withdrawal_estimate", { account: "Pension fund" });
  const account = document.accounts.find((item) => item.uuid === "acc-savings");
  const expected = estimateSavingsWithdrawal(10000, account.savingsDetails).estimatedNetWithdrawal;
  assert.match(facts, new RegExp(`estimated net ${expected.toFixed(2)} USD`));
  assert.match(facts, /retirement/);
});

test("credit, obligations and affordability use recorded commitments", () => {
  const document = richDocument();
  const credit = run(document, "credit_position").facts;
  assert.match(credit, /Visa \| 3500\.00 USD \| 4000\.00 USD \| 88%/);
  assert.match(credit, /no, short 500\.00 USD/);
  const upcoming = run(document, "upcoming_obligations", { days: 30 }).facts;
  assert.match(upcoming, /Netflix/);
  assert.match(upcoming, /card payment \| Visa/);
  assert.match(upcoming, /loan due \| Car loan/);
  const afford = run(document, "affordability_check", { amount: 2000 }).facts;
  assert.match(afford, /SCENARIO/);
  assert.match(afford, /liquid cash now 3200\.00 USD/);
  assert.match(afford, /card payments -3500\.00 USD/);
});

test("goal feasibility and loan payoff are computed, not guessed", () => {
  const document = richDocument();
  assert.match(run(document, "goal_feasibility", { id: "Laptop" }).facts, /required 334\.05 USD\/month/);
  const payoff = run(document, "debt_payoff_scenario", { id: "Car loan", extraPayment: 100 }).facts;
  assert.match(payoff, /current plan: \d+ months/);
  assert.match(payoff, /fewer\)/);
});

test("people summaries never expose contact details", () => {
  const { facts } = run(richDocument(), "people_summary", {});
  assert.match(facts, /Alex/);
  assert.ok(!facts.includes("555-0100"));
  assert.ok(!facts.includes("alex@example.com"));
});

test("priorities are ranked deterministically with measured impact", () => {
  const document = richDocument();
  const priorities = selectFinancialPriorities(new ToolContext(document, NOW));
  assert.ok(priorities.length >= 3);
  const codes = priorities.map((item) => item.titleCode);
  assert.ok(codes.includes("card_payment_shortfall") || codes.includes("high_credit_use"));
  for (let index = 1; index < priorities.length; index++)
    assert.ok(priorities[index - 1].score >= priorities[index].score);
  // Same input, same ranking.
  assert.deepEqual(
    selectFinancialPriorities(new ToolContext(document, NOW)).map((item) => item.id),
    priorities.map((item) => item.id),
  );
  const bundle = run(document, "financial_advice_context", {}, 12_000);
  assert.match(bundle.facts, /\[financial_priorities\]/);
  assert.match(bundle.facts, /\[analysis_coverage\]/);
  assert.ok(bundle.evidence.facts.length > 5);
  assert.ok(bundle.facts.length <= 12_000);
});

test("evidence audit flags numbers the answer invented", () => {
  const evidence = run(richDocument(), "cash_flow", { period: "this_month" }).evidence;
  assert.deepEqual(auditAnswerNumbers("You earned **5,000.00 USD** this month.", evidence).unsupported, []);
  assert.deepEqual(auditAnswerNumbers("You spent 7,777 USD on dining.", evidence).unsupported, [7777]);
});

test("model arguments are validated against each tool", () => {
  assert.deepEqual(sanitizeToolArgs({ period: "this_month", limit: 5, sql: "DROP" }, "cash_flow"), { period: "this_month" });
  assert.deepEqual(sanitizeToolArgs({ interval: "hour", months: 900 }, "spending_trend"), { months: 120 });
  assert.deepEqual(parseToolCalls('{"tool_calls":[{"name":"execute_sql","args":{}}]}'), []);
  const [call] = parseToolCalls(
    '{"tool_calls":[{"name":"prepare_change","args":{"operation":"remove","entityType":"expense","entityId":"Coffee","fields":{"amount":"12","nested":{"x":1}}}}]}',
  );
  assert.equal(call.change.operation, "delete");
  assert.equal(call.change.entityType, "transaction");
  assert.deepEqual(call.change.userProvidedFields, { amount: "12" });
  assert.equal(sanitizeChangeArgs({ operation: "drop_table", entityType: "transaction" }), null);
});

const INTENTS = [
  ["How much did I spend on restaurants this month?", "spending_question", "this_month"],
  ["כמה הוצאתי על מסעדות החודש?", "spending_question", "this_month"],
  ["Сколько я потратил на рестораны в этом месяце?", "spending_question", "this_month"],
  ["Compare my spending with last month", "spending_question", "last_month"],
  ["What is my net worth?", "net_worth_question"],
  ["מה השווי הנקי שלי?", "net_worth_question"],
  ["Какова моя чистая стоимость?", "net_worth_question"],
  ["Am I on track with my budgets?", "budget_question"],
  ["איך אני עומד בתקציב?", "budget_question"],
  ["Какой у меня баланс на счету?", "account_question"],
  ["What payments are due in the next 14 days?", "recurring_question", "next_14_days"],
  ["Which subscriptions are costing me the most?", "subscription_question"],
  ["Can I afford a 5,000 ILS laptop next month?", "affordability"],
  ["האם אני יכול להרשות לעצמי מחשב ב-5000?", "affordability"],
  ["Могу ли я позволить себе ноутбук за 5000?", "affordability"],
  ["How can I improve my financial situation?", "financial_advice"],
  ["איך אני יכול לשפר את המצב הכלכלי שלי?", "financial_advice"],
  ["Как мне улучшить свои финансы?", "financial_advice"],
  ["Find duplicate transactions", "data_quality"],
  ["What happens if I reduce restaurant spending by 20%?", "scenario"],
  ["What is compound interest?", "general_finance_education"],
];

test("multilingual intent routing picks the right packs", () => {
  for (const [question, intent, period] of INTENTS) {
    const route = resolveIntent(question);
    assert.equal(route.intent, intent, question);
    if (period) assert.equal(route.requestedPeriod, period, question);
  }
  const advice = resolveIntent("How can I improve my finances?");
  assert.deepEqual(advice.mandatoryCalls.map((call) => call.name), ["financial_advice_context"]);
  const afford = resolveIntent("Can I afford a 5,000 ILS laptop next month?");
  assert.equal(afford.mandatoryCalls[0].name, "affordability_check");
  assert.equal(afford.mandatoryCalls[0].args.amount, 5000);
  assert.equal(afford.mandatoryCalls[0].args.currency, "ILS");
  assert.equal(resolveIntent("כמה הוצאתי?").language, "he");
  assert.equal(resolveIntent("Сколько?").language, "ru");
});

test("mutation wording is detected in three languages, questions are not", () => {
  for (const [question, operation, entity] of [
    ["Create a 700 ILS groceries budget", "create", "budget"],
    ["Change this transaction from 340 to 304", "update", "transaction"],
    ["Delete yesterday's duplicate restaurant transaction", "delete", "transaction"],
    ["Archive the Netflix subscription", "archive", "recurring"],
    ["I spent 50 on coffee", "create", "transaction"],
    ["תוסיף הוצאה של 45 על מכולת", "create", "transaction"],
    ["תמחק את התקציב של מסעדות", "delete", "budget"],
    ["Добавь расход 45 на продукты", "create", "transaction"],
    ["Удали подписку Netflix", "delete", "recurring"],
  ]) {
    const route = resolveIntent(question);
    assert.equal(route.mutationIntent, operation, question);
    assert.equal(route.mutationEntity, entity, question);
    assert.deepEqual(route.packs, ["mutation"], question);
  }
  for (const question of ["Why did my spending change?", "Should I cut restaurants?", "How much did I spend?"])
    assert.equal(resolveIntent(question).mutationIntent, null, question);
});

test("fallback extraction reads only what the words say", () => {
  assert.deepEqual(extractChangeRequest("Change this transaction from 340 to 304", "update", "transaction").userProvidedFields, {
    currentAmount: 340,
    amount: 304,
  });
  const budget = extractChangeRequest("Create a 700 ILS groceries budget", "create", "budget");
  assert.equal(budget.userProvidedFields.amount, 700);
  assert.equal(budget.userProvidedFields.currency, "ILS");
  assert.equal(budget.userProvidedFields.category, "groceries");
  const removal = extractChangeRequest("Delete yesterday's duplicate restaurant transaction", "delete", "transaction");
  assert.equal(removal.entityId, "yesterday restaurant");
});

function storeFor(clock = () => NOW) {
  let n = 0;
  return new ProposalStore(() => `generated-${++n}`, clock);
}

function committer(holder) {
  return async (updater) => {
    holder.document = normalizeBackupDocument(updater(cloneBackupDocument(holder.document)));
  };
}

test("a proposal never writes; cancel leaves the document byte-identical", async () => {
  const holder = { document: richDocument() };
  const before = JSON.stringify(holder.document);
  const store = storeFor();
  const result = store.prepare(holder.document, {
    operation: "create",
    entityType: "transaction",
    userProvidedFields: { name: "Coffee", amount: 12.5, category: "Restaurants" },
  });
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(holder.document), before);
  assert.match(result.proposal.sideEffects[0].description, /Checking balance changes from 3000\.00 to 2987\.50/);
  assert.equal(store.cancel(result.proposal.proposalId).status, "cancelled");
  assert.equal((await store.execute(result.proposal.proposalId, committer(holder))).status, "cancelled");
  assert.equal(JSON.stringify(holder.document), before);
});

test("confirm applies once through the domain service", async () => {
  const holder = { document: richDocument() };
  const store = storeFor();
  const { proposal } = store.prepare(holder.document, {
    operation: "create",
    entityType: "transaction",
    userProvidedFields: { name: "Coffee", amount: 12.5, category: "Restaurants" },
  });
  const first = await store.execute(proposal.proposalId, committer(holder));
  assert.equal(first.status, "completed");
  assert.equal(first.final.amount, 12.5);
  const second = await store.execute(proposal.proposalId, committer(holder));
  assert.equal(second.status, "completed");
  assert.equal(holder.document.transactions.filter((item) => item.name === "Coffee").length, 1);
  // saveTransaction updated the balance and denormalized links.
  assert.equal(holder.document.accounts.find((item) => item.uuid === "acc-bank").amount, 2987.5);
});

test("a proposal becomes stale when its record changes before confirmation", async () => {
  const holder = { document: richDocument() };
  const store = storeFor();
  const { proposal } = store.prepare(holder.document, {
    operation: "update",
    entityType: "transaction",
    entityId: "Mystery",
    userProvidedFields: { amount: 35 },
  });
  // A concurrent edit in another screen.
  await committer(holder)((current) => ({
    ...current,
    transactions: current.transactions.map((item) => (item.uuid === "t-uncat" ? { ...item, name: "Mystery shop" } : item)),
  }));
  const result = await store.execute(proposal.proposalId, committer(holder));
  assert.equal(result.status, "stale");
  assert.equal(holder.document.transactions.find((item) => item.uuid === "t-uncat").amount, 30);
});

test("unknown, expired and other-profile targets never execute", async () => {
  const holder = { document: richDocument() };
  const before = JSON.stringify(holder.document);
  let now = NOW;
  const store = storeFor(() => now);
  assert.equal((await store.execute("made-up-by-the-model", committer(holder))).status, "unknown");
  const other = store.prepare(holder.document, { operation: "delete", entityType: "transaction", entityId: "t-other" });
  assert.equal(other.ok, false);
  const { proposal } = store.prepare(holder.document, { operation: "delete", entityType: "goal", entityId: "Laptop" });
  now = new Date(NOW.getTime() + 60 * 60_000);
  assert.equal((await store.execute(proposal.proposalId, committer(holder))).status, "expired");
  assert.equal(JSON.stringify(holder.document), before);
  // A fresh store (app restart) knows nothing about earlier proposals.
  assert.equal((await storeFor().execute(proposal.proposalId, committer(holder))).status, "unknown");
});

test("cascade previews match what the delete actually does", async () => {
  const holder = { document: richDocument() };
  const store = storeFor();
  const { proposal } = store.prepare(holder.document, { operation: "delete", entityType: "account", entityId: "Checking" });
  assert.equal(proposal.strongConfirmation, true);
  assert.equal(proposal.destructive, true);
  const deleted = proposal.sideEffects.find((effect) => effect.kind === "records_deleted" && effect.params.collection === "transactions");
  const before = holder.document.transactions.length;
  await store.execute(proposal.proposalId, committer(holder));
  assert.equal(before - holder.document.transactions.length, deleted.params.count);
  for (const id of deleted.affectedEntityIds)
    assert.ok(!holder.document.transactions.some((item) => item.uuid === id));
});

test("category deletes preview detached transactions and budget updates", () => {
  const document = richDocument();
  const { proposal } = storeFor().prepare(document, { operation: "delete", entityType: "category", entityId: "Groceries" });
  const kinds = proposal.sideEffects.map((effect) => `${effect.kind}:${effect.params.collection}`);
  assert.ok(kinds.includes("records_updated:transactions"));
});

test("ambiguous and invalid requests ask instead of guessing", () => {
  const document = richDocument();
  const store = storeFor();
  const ambiguous = store.prepare(document, { operation: "delete", entityType: "transaction", entityId: "Cafe Nero" });
  assert.equal(ambiguous.code, "AMBIGUOUS_ENTITY");
  assert.ok(ambiguous.candidates.length >= 2);
  const invalid = store.prepare(document, { operation: "create", entityType: "budget", userProvidedFields: { name: "No amount" } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "MUTATION_VALIDATION_FAILED");
  const parent = store.prepare(document, { operation: "create", entityType: "transaction", userProvidedFields: { name: "Lunch", amount: 20, category: "Food" } });
  assert.equal(parent.ok, true);
  assert.match(parent.proposal.warnings.join(" "), /subcategories/);
});

test("in-card edits re-validate and replace the proposal", async () => {
  const holder = { document: richDocument() };
  const store = storeFor();
  const { proposal } = store.prepare(holder.document, {
    operation: "create",
    entityType: "transaction",
    userProvidedFields: { name: "Lunch", amount: 20 },
  });
  const revised = store.revise(holder.document, proposal.proposalId, { account: "acc-cash", amount: "25" });
  assert.equal(revised.ok, true);
  assert.equal(store.status(proposal.proposalId), "cancelled");
  assert.equal((await store.execute(proposal.proposalId, committer(holder))).status, "cancelled");
  await store.execute(revised.proposal.proposalId, committer(holder));
  const saved = holder.document.transactions.find((item) => item.name === "Lunch");
  assert.equal(saved.account, "acc-cash");
  assert.equal(saved.amount, 25);
});

test("simple collections create and detach references through proposals", async () => {
  const holder = { document: richDocument() };
  const store = storeFor();
  const goal = store.prepare(holder.document, { operation: "create", entityType: "goal", userProvidedFields: { name: "Trip", targetAmount: 3000, targetDate: "2027-06-01" } });
  await store.execute(goal.proposal.proposalId, committer(holder));
  assert.equal(holder.document.goals.find((item) => item.name === "Trip").user, ME);
  const label = store.prepare(holder.document, { operation: "delete", entityType: "label", entityId: "Fun" });
  await store.execute(label.proposal.proposalId, committer(holder));
  const tagged = holder.document.transactions.find((item) => item.uuid === "t-rest-sep");
  assert.equal(tagged.label, null);
  assert.deepEqual(tagged.tags, []);
});

/** A scripted stand-in for Gemma that records every prompt. */
function fakeModel(replies) {
  const calls = [];
  return {
    calls,
    resetConversation() {},
    async execute(parts, onToken) {
      const text = parts.map((part) => part.text ?? `[${part.type}]`).join("\n");
      calls.push(text);
      const reply = typeof replies === "function" ? replies(text, calls.length) : replies.shift() ?? "";
      onToken?.(reply, true);
      return reply;
    },
  };
}

const t = (key, values) => `${key}${values ? JSON.stringify(values) : ""}`;
const prompt = { now: NOW, currency: "USD", monthStartDay: 10, appLanguage: "en" };

test("broad advice always reads the full evidence bundle", async () => {
  const model = fakeModel((text) => (text.includes("TOOL_RESULTS") ? "Your score is fine." : '{"tool_calls":[{"name":"accounts"}]}'));
  const result = await runChatTurn({
    model,
    document: richDocument(),
    question: "How can I improve my finances?",
    history: [],
    prompt,
    contextTokens: 8192,
    proposals: storeFor(),
    t,
  });
  // No planning step: the bundle is mandatory.
  assert.equal(model.calls.length, 1);
  assert.match(model.calls[0], /\[financial_advice_context\]/);
  assert.match(model.calls[0], /\[financial_priorities\]/);
  assert.equal(result.kind, "answer");
});

test("data questions never accept an ungrounded direct answer", async () => {
  const model = fakeModel((text) =>
    text.includes("TOOL_RESULTS") ? "You spent **940.00 USD**." : "You spent about 10,000 dollars.",
  );
  const result = await runChatTurn({
    model,
    document: richDocument(),
    question: "How much did I spend this month?",
    history: [],
    prompt,
    contextTokens: 8192,
    proposals: storeFor(),
    t,
    audit: true,
  });
  assert.equal(result.kind, "answer");
  assert.equal(result.text, "You spent **940.00 USD**.");
  assert.match(model.calls[1], /TOOL_RESULTS/);
});

test("a mutation turn ends in a pending proposal, never a write", async () => {
  const document = richDocument();
  const before = JSON.stringify(document);
  const store = storeFor();
  const model = fakeModel([
    '{"tool_calls":[{"name":"prepare_change","args":{"operation":"create","entityType":"budget","fields":{"name":"Groceries","amount":700,"category":"Groceries"}}}]}',
  ]);
  const result = await runChatTurn({
    model,
    document,
    question: "Create a 700 groceries budget",
    history: [],
    prompt,
    contextTokens: 8192,
    proposals: store,
    t,
  });
  assert.equal(result.kind, "proposal");
  assert.equal(store.status(result.proposalId), "pending");
  assert.deepEqual(result.cards, [{ kind: "change_proposal", proposalId: result.proposalId }]);
  assert.equal(JSON.stringify(document), before);
});

test("the words decide the operation; the model cannot escalate to delete", async () => {
  const store = storeFor();
  const model = fakeModel([
    '{"tool_calls":[{"name":"prepare_change","args":{"operation":"delete","entityType":"transaction","entityId":"Mystery"}}]}',
  ]);
  const result = await runChatTurn({
    model,
    document: richDocument(),
    question: "Change the Mystery transaction to 35",
    history: [],
    prompt,
    contextTokens: 8192,
    proposals: store,
    t,
  });
  if (result.kind === "proposal") assert.equal(store.get(result.proposalId).operation, "update");
  else assert.equal(result.kind, "clarification");
});

test("the deterministic fallback prepares a proposal when the model gives no JSON", async () => {
  const store = storeFor();
  const model = fakeModel(["Sure, I can help with that."]);
  const result = await runChatTurn({
    model,
    document: richDocument(),
    question: "Change this transaction from 400 to 40",
    history: [],
    prompt,
    contextTokens: 8192,
    proposals: store,
    t,
  });
  assert.equal(result.kind, "proposal");
  const proposal = store.get(result.proposalId);
  assert.equal(proposal.entityId, "t-rest-sep");
  assert.deepEqual(proposal.changedFields.find((item) => item.field === "amount"), { field: "amount", before: 400, after: 40 });
});

test("recordings must match the 16 kHz mono PCM16 WAV contract", () => {
  const good = {
    uri: "file:///cache/plutus-voice-1.wav",
    path: "/cache/plutus-voice-1.wav",
    container: "wav",
    format: 1,
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    dataBytes: 64000,
    sizeBytes: 64044,
    durationMs: 2000,
  };
  assert.equal(validateRecording(good), good);
  const codes = [
    [{ ...good, path: "file:///cache/x.wav" }, "AUDIO_FORMAT_INVALID"],
    [{ ...good, container: "unknown" }, "AUDIO_FORMAT_INVALID"],
    [{ ...good, sampleRate: 44100 }, "AUDIO_NORMALIZATION_FAILED"],
    [{ ...good, channels: 2 }, "AUDIO_NORMALIZATION_FAILED"],
    [{ ...good, dataBytes: 0 }, "AUDIO_EMPTY"],
    [{ ...good, durationMs: 100 }, "AUDIO_TOO_SHORT"],
    [{ ...good, durationMs: 90_000 }, "AUDIO_TOO_LONG"],
  ];
  for (const [info, code] of codes) assert.throws(() => validateRecording(info), (error) => error.code === code, code);
  assert.equal(uriToPath("file:///data/user/0/app/cache/plutus%20voice.wav"), "/data/user/0/app/cache/plutus voice.wav");
});

test("transcripts are recovered from JSON, fences or plain text", () => {
  assert.deepEqual(parseTranscript('{"transcript":"How much did I spend?","language":"en"}'), {
    transcript: "How much did I spend?",
    language: "en",
  });
  assert.equal(parseTranscript('```json\n{"transcript":"כמה הוצאתי?"}\n```').language, "he");
  assert.equal(parseTranscript('{"transcript":"Сколько я потратил?", "language":')?.transcript, "Сколько я потратил?");
  assert.equal(parseTranscript("Transcript: add 50 for coffee").transcript, "add 50 for coffee");
  assert.throws(() => parseTranscript("   "), (error) => error.code === "TRANSCRIPT_EMPTY");
});

test("the voice state machine only allows valid transitions", () => {
  let state = { type: "idle" };
  state = voiceReducer(state, { type: "stop" });
  assert.equal(state.type, "idle");
  state = voiceReducer(state, { type: "request_permission" });
  state = voiceReducer(state, { type: "permission_granted", at: 5 });
  assert.deepEqual(state, { type: "recording", startedAt: 5 });
  state = voiceReducer(state, { type: "transcript", transcript: "x" });
  assert.equal(state.type, "recording");
  for (const event of ["stop", "validate", "transcribe"]) state = voiceReducer(state, { type: event });
  assert.equal(state.type, "transcribing");
  state = voiceReducer(state, { type: "transcript", transcript: "hello" });
  assert.deepEqual(state, { type: "ready_transcript", transcript: "hello" });
  assert.equal(voiceReducer({ type: "recording", startedAt: 1 }, { type: "cancel" }).type, "cancelled");
  assert.equal(voiceReducer({ type: "error", code: "AUDIO_EMPTY" }, { type: "request_permission" }).type, "requesting_permission");
});

test("the AI intro flag is additive and validated", () => {
  const base = richDocument();
  assert.equal(base._local.aiFirstChatAt, null);
  const kept = normalizeBackupDocument({ ...base, _local: { ...base._local, aiFirstChatAt: "2026-09-26T10:00:00.000Z" } });
  assert.equal(kept._local.aiFirstChatAt, "2026-09-26T10:00:00.000Z");
  const invalid = normalizeBackupDocument({ ...base, _local: { ...base._local, aiFirstChatAt: "not a date" } });
  assert.equal(invalid._local.aiFirstChatAt, null);
});

test("priority evidence uses plain words, not internal codes", () => {
  const { facts } = run(richDocument(), "financial_priorities");
  assert.ok(!/[A-Z]{3,}_[A-Z_]{3,}/.test(facts), facts);
  assert.ok(!/\b[a-z]+_[a-z_]+:/.test(facts), facts);
});

const { cleanMentions, stripQuestionEcho } = require("../src/features/local-ai/chat-controller.ts");
const { parseMarkdown } = require("../src/features/local-ai/markdown.ts");
const { CHAT_COMMANDS, filterCommands } = require("../src/features/local-ai/commands.ts");
const { en: enCatalog } = require("../src/localization/locales/en.ts");
const { he: heCatalog } = require("../src/localization/locales/he.ts");
const { ru: ruCatalog } = require("../src/localization/locales/ru.ts");

test("tools publish short mention references for inline cards", () => {
  const result = run(richDocument(), "accounts");
  const ref = Object.keys(result.mentions).find((key) => result.mentions[key].id === "acc-bank");
  assert.equal(ref, "A1");
  assert.deepEqual(result.mentions.A1, { kind: "account", id: "acc-bank" });
  assert.match(result.facts, /\[mentions\] records you can show inline: @A1 = Checking \(account\)/);
  // Storage ids never reach the model through the mention line.
  assert.ok(!/acc-bank/.test(result.facts.split("[mentions]")[1]));
});

test("answers keep only real mentions and never echo the question", () => {
  assert.equal(
    cleanMentions("Your accounts:\n@A1\n@A9 is fine.", { A1: { kind: "account", id: "x" } }),
    "Your accounts:\n@A1\n is fine.",
  );
  assert.equal(
    stripQuestionEcho("What is my net worth?\nYour net worth is **12,000 USD**.", "What is my net worth?"),
    "Your net worth is **12,000 USD**.",
  );
  assert.equal(
    stripQuestionEcho("You asked about spending.\nYou spent **940 USD**.", "How much did I spend?"),
    "You spent **940 USD**.",
  );
  const kept = "Your net worth is **12,000 USD**.\nMostly in savings.";
  assert.equal(stripQuestionEcho(kept, "What is my net worth?"), kept);
});

test("markdown turns reference lines into inline card blocks", () => {
  const blocks = parseMarkdown("## Accounts\nSpread across:\n\n@A1\n@A2\nThis one is overdrawn, see @A1.\n\n---\n> Keep a buffer.");
  assert.deepEqual(blocks.map((block) => block.kind), ["heading", "paragraph", "mentions", "paragraph", "rule", "quote"]);
  assert.deepEqual(blocks[2].refs, ["A1", "A2"]);
  assert.deepEqual(blocks[3].content.find((node) => node.kind === "mention"), { kind: "mention", ref: "A1" });
});

test("every command runs a real tool and is named in all languages", () => {
  for (const command of CHAT_COMMANDS) {
    for (const call of command.calls ?? []) assert.equal(typeof TOOL_RUNNERS[call.name], "function", command.id);
    assert.ok(command.calls?.length || command.template, command.id);
    for (const catalog of [enCatalog, heCatalog, ruCatalog]) {
      assert.ok(catalog.localAI.commands.items[command.id], command.id);
      if (command.template) assert.ok(catalog.localAI.commands.templates[command.id], command.id);
    }
  }
  const label = (command) => enCatalog.localAI.commands.items[command.id];
  assert.deepEqual(filterCommands(CHAT_COMMANDS, "net worth", label).map((command) => command.id), ["netWorth", "netWorthHistory"]);
  assert.equal(filterCommands(CHAT_COMMANDS, "/", label).length, CHAT_COMMANDS.length);
  // Hebrew templates still read as create requests for the router.
  assert.equal(resolveIntent(`${heCatalog.localAI.commands.templates.addExpense}50 על קפה`).mutationIntent, "create");
  assert.equal(resolveIntent(`${ruCatalog.localAI.commands.templates.addExpense}50 на кофе`).mutationIntent, "create");
});
