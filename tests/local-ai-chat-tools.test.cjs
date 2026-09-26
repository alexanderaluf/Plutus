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
} = require("../src/data/model/normalize-backup.ts");
const {
  inferToolCalls,
  looksLikeMissingData,
  parseReadTools,
  parseToolCalls,
  resolvePeriod,
} = require("../src/features/local-ai/chat-tool-protocol.ts");
const { runChatTools } = require("../src/features/local-ai/chat-tools.ts");
const { parseMarkdown } = require("../src/features/local-ai/markdown.ts");

const PROFILE = "alex-personal";
const NOW = new Date(2026, 8, 26, 12, 0, 0);

function documentWith(transactions) {
  const base = createLegacyDevelopmentBackup();
  return normalizeBackupDocument({
    ...base,
    _local: {
      ...base._local,
      selectedProfileId: PROFILE,
      monthStartDay: 1,
      mainCurrency: "USD",
    },
    users: [{ uuid: PROFILE, name: "Alex", currency: "USD" }],
    accounts: [
      {
        uuid: "account-main",
        name: "Everyday Card",
        currencyCode: "USD",
        amount: 1000,
        user: PROFILE,
      },
      {
        uuid: "account-savings",
        name: "Savings",
        currencyCode: "USD",
        amount: 5000,
        user: PROFILE,
      },
    ],
    categories: [
      { uuid: "category-rent", name: "Rent", user: PROFILE },
      { uuid: "category-food", name: "Food", user: PROFILE },
      { uuid: "category-salary", name: "Salary", type: 1, user: PROFILE },
    ],
    budgets: [],
    recurrings: [],
    transactions,
  });
}

function entry(index, name, overrides = {}) {
  return {
    uuid: `tx-${index}`,
    name,
    account: "account-main",
    category: "category-food",
    amount: 10,
    currencyCode: "USD",
    type: 0,
    user: PROFILE,
    date: "2026-09-10T10:00:00.000Z",
    createdAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

const document = documentWith([
  entry(1, "Rent payment", {
    category: "category-rent",
    amount: 4300,
    date: "2026-09-01T09:00:00.000Z",
  }),
  entry(2, "Groceries", { amount: 120, date: "2026-09-12T09:00:00.000Z" }),
  entry(3, "Salary", {
    category: "category-salary",
    type: 1,
    amount: 9000,
    date: "2026-09-05T09:00:00.000Z",
  }),
  entry(4, "Rent payment", {
    category: "category-rent",
    amount: 4300,
    date: "2026-08-01T09:00:00.000Z",
  }),
  entry(5, "Coffee", { amount: 5, date: "2026-08-20T09:00:00.000Z" }),
]);

test("tool requests keep only approved tools and sanitized arguments", () => {
  assert.deepEqual(
    parseReadTools('{"tools":["largest_expenses","accounts","delete_all"]}'),
    ["largest_expenses", "accounts"],
  );
  assert.deepEqual(parseReadTools('```json\n{"tools":["budgets"]}\n```'), [
    "budgets",
  ]);
  assert.equal(parseToolCalls("I can help with that."), null);
  assert.deepEqual(
    parseToolCalls(
      'Sure: {"tools":[{"name":"cash_flow","args":{"period":"last_month","limit":"900","sql":"DROP"}}]}',
    ),
    // Keys the tool does not accept (limit, sql) are dropped.
    [{ name: "cash_flow", args: { period: "last_month" } }],
  );
  assert.deepEqual(
    parseToolCalls(
      '{"tools":[{"name":"search_transactions","args":{"limit":"900","merchant":"Cafe"}}]}',
    ),
    [{ name: "search_transactions", args: { merchant: "Cafe", limit: 50 } }],
  );
});

test("keyword fallback covers questions the model failed to route", () => {
  assert.deepEqual(
    inferToolCalls("What was my highest expense ever?").map((c) => c.name),
    ["largest_expenses"],
  );
  assert.deepEqual(inferToolCalls("What is my net worth last month"), [
    { name: "net_worth", args: { period: "last_month" } },
  ]);
  assert.deepEqual(
    inferToolCalls("How much money do I have last month").map((c) => c.name),
    ["net_worth"],
  );
  assert.equal(
    inferToolCalls("biggest expense in the last 3 months")[0].args.period,
    "last_3_months",
  );
  assert.ok(
    looksLikeMissingData(
      "I do not have access to information regarding your net worth.",
    ),
  );
});

test("periods resolve to half-open local ranges", () => {
  const lastMonth = resolvePeriod({ period: "last_month" }, NOW, 1);
  assert.equal(lastMonth.label, "2026-08-01..2026-08-31");
  assert.equal(
    resolvePeriod({ period: "2026-07" }, NOW, 1).label,
    "2026-07-01..2026-07-31",
  );
  assert.equal(
    resolvePeriod({ from: "2026-09-01", to: "2026-09-10" }, NOW, 1).label,
    "2026-09-01..2026-09-10",
  );
  assert.equal(resolvePeriod({ period: "someday" }, NOW, 1), null);
});

test("largest expenses respect the period and produce transaction cards", () => {
  const result = runChatTools(
    document,
    [{ name: "largest_expenses", args: { period: "this_month", limit: 2 } }],
    { charBudget: 5000, now: NOW },
  );
  assert.match(result.facts, /2 matches|3 matches/);
  assert.match(result.facts, /4300\.00 USD \| Rent payment/);
  assert.deepEqual(
    result.cards.map((card) => card.id),
    ["tx-1", "tx-2"],
  );
});

test("cash flow and category summaries total income and expenses", () => {
  const { facts } = runChatTools(
    document,
    [
      { name: "cash_flow", args: { period: "this_month" } },
      { name: "spending_summary", args: { period: "last_month" } },
    ],
    { charBudget: 5000, now: NOW },
  );
  assert.match(
    facts,
    /income 9000\.00 USD, expenses 4420\.00 USD, net 4580\.00 USD, savings rate 51%/,
  );
  assert.match(facts, /Rent \| 4300\.00 USD \| 100%/);
});

test("net worth at the end of a past period rewinds later transactions", () => {
  const now = runChatTools(document, [{ name: "net_worth", args: {} }], {
    charBudget: 5000,
    now: NOW,
  }).facts;
  assert.match(now, /net worth 6000\.00 USD/);
  const august = runChatTools(
    document,
    [{ name: "net_worth", args: { period: "last_month" } }],
    { charBudget: 5000, now: NOW },
  ).facts;
  // September: -4300 rent, -120 groceries, +9000 salary => +4580.
  assert.match(august, /net worth 1420\.00 USD/);
});

test("the snapshot covers every area and stays inside its budget", () => {
  const { facts } = runChatTools(
    document,
    [{ name: "financial_snapshot", args: {} }],
    { charBudget: 3000, now: NOW },
  );
  assert.ok(facts.length <= 3000 + 60);
  for (const section of ["[financial_snapshot]", "[accounts]", "[cash_flow]"])
    assert.ok(facts.includes(section), section);
});

test("markdown answers parse into readable blocks", () => {
  const blocks = parseMarkdown(
    "Your biggest expense was **4,300.00 EUR**.\n\n### Details\n- Rent: *monthly*\n- Coffee `x`\n\n| Month | Spent |\n|---|---:|\n| Aug | 4,305.00 |\n| Sep | 4,420.00 |",
  );
  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["paragraph", "heading", "list", "table"],
  );
  assert.equal(blocks[0].content[1].kind, "bold");
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[3].rows.length, 2);
  assert.equal(blocks[3].align[1], "right");
  // snake_case words are not italic.
  assert.equal(parseMarkdown("use net_worth_tool")[0].content.length, 1);
});

const {
  isAdviceQuestion,
  stripToolJson,
} = require("../src/features/local-ai/chat-tool-protocol.ts");
const {
  detectDirection,
  detectLanguageName,
} = require("../src/features/local-ai/text-direction.ts");

test("malformed tool JSON is recovered and never shown as an answer", () => {
  // Seen on device: the closing ] was missing.
  assert.deepEqual(
    parseToolCalls(
      '{"tools":[{"name":"net_worth","args":{"period":"this_year"}}}',
    ),
    [{ name: "net_worth", args: { period: "this_year" } }],
  );
  assert.deepEqual(parseToolCalls('{"tools":["accounts","budgets"'), [
    { name: "accounts", args: {} },
    { name: "budgets", args: {} },
  ]);
  assert.deepEqual(parseToolCalls('{"tools":[{"name":"delete_all"'), []);
  assert.equal(
    stripToolJson('{"tools":["accounts"]}\nYour balance is **10 USD**.'),
    "Your balance is **10 USD**.",
  );
  assert.equal(stripToolJson("Plain answer."), "Plain answer.");
});

test("open-ended questions are routed to the mandatory advice bundle", () => {
  for (const question of [
    "How do I improve my finance?",
    "איך אני יכול לשפר את המצב הכלכלי שלי?",
    "Как мне улучшить свои финансы?",
  ]) {
    assert.ok(isAdviceQuestion(question), question);
    assert.deepEqual(
      inferToolCalls(question)
        .slice(0, 1)
        .map((call) => call.name),
      ["financial_advice_context"],
    );
  }
  assert.equal(isAdviceQuestion("What is my balance?"), false);
});

test("answer direction follows the answer's language, not the app's", () => {
  assert.equal(detectDirection("השווי הנקי שלך הוא **6,000 USD**"), "rtl");
  // A Hebrew sentence that opens with a currency code still reads RTL.
  assert.equal(detectDirection("EUR 4,300 הוא סכום השכירות החודשי שלך"), "rtl");
  assert.equal(detectDirection("Your net worth is 6,000 ₪"), "ltr");
  assert.equal(detectDirection("4,300.00", "rtl"), "rtl");
  assert.equal(detectLanguageName("כמה הוצאתי?"), "Hebrew");
  assert.equal(detectLanguageName("Сколько?"), "Russian");
});

test("the health tool summarizes score, trends and findings", () => {
  const { facts } = runChatTools(
    document,
    [{ name: "financial_health", args: {} }],
    { charBudget: 5000, now: NOW },
  );
  assert.match(facts, /\[financial_health\]/);
  assert.match(facts, /health score \d+\/100/);
  assert.match(facts, /findings/);
});
