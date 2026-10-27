const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
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
  normalizeNotificationPreferences,
} = require("../src/data/model/normalize-backup.ts");
const {
  LOCAL_SCHEMA_VERSION,
} = require("../src/data/model/backup-document.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const {
  planDailyNotifications,
  DAILY_NOTIFICATION_DAYS,
} = require("../src/data/notifications/daily-notification-plan.ts");
const {
  sameDayLastMonth,
} = require("../src/data/selectors/notification-selectors.ts");
const {
  recurringDefaults,
  saveRecurring,
} = require("../src/data/model/recurring-record.ts");

const PROFILE = "alex-personal";
// Tuesday 27 Oct 2026, 07:00 local.
const NOW = new Date(2026, 9, 27, 7, 0);

function documentWith(
  transactions,
  { notifications, local = {}, recurrings = [] } = {},
) {
  const base = createLegacyDevelopmentBackup();
  return normalizeBackupDocument({
    ...base,
    _local: {
      ...base._local,
      selectedProfileId: PROFILE,
      notifications,
      ...local,
    },
    users: [{ uuid: PROFILE, name: "Alex", currency: "USD", isSelected: true }],
    accounts: [
      {
        uuid: "account-main",
        name: "Checking",
        user: PROFILE,
        amount: 5000,
        currencyCode: "USD",
        accountType: "cash",
      },
    ],
    transactions,
    recurrings,
  });
}

function expense(id, amount, date, extra = {}) {
  return {
    uuid: id,
    name: id,
    user: PROFILE,
    account: "account-main",
    amount,
    accountAmount: amount,
    currencyCode: "USD",
    type: 0,
    date: date.toISOString(),
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    ...extra,
  };
}

const only = (kind, time = "20:00") => {
  const preferences = normalizeNotificationPreferences(null);
  preferences[kind] = { enabled: true, time };
  return preferences;
};

// Readable stand-ins for i18next and currency formatting.
const text = {
  t: (key, options = {}) =>
    [key.split(".").slice(-1)[0], ...Object.values(options)].join("|"),
  money: (amount, code) => `${code} ${amount}`,
};

test("schema 24 stores notification preferences, all off by default", () => {
  assert.equal(LOCAL_SCHEMA_VERSION, 24);
  const defaults = createDefaultBackup()._local.notifications;
  assert.deepEqual(defaults, {
    expenseReminder: { enabled: false, time: "20:00" },
    dailySummary: { enabled: false, time: "21:00" },
    recurringDigest: { enabled: false, time: "09:00" },
  });
  // Older documents and damaged values fall back field by field.
  assert.deepEqual(
    normalizeNotificationPreferences({
      expenseReminder: { enabled: true, time: "08:00" },
      dailySummary: { enabled: "yes", time: "25:00" },
      recurringDigest: "broken",
    }),
    {
      expenseReminder: { enabled: true, time: "08:00" },
      dailySummary: { enabled: false, time: "21:00" },
      recurringDigest: { enabled: false, time: "09:00" },
    },
  );
  const restored = normalizeBackupDocument({ _local: {} });
  assert.equal(restored._local.notifications.dailySummary.time, "21:00");
});

test("nothing is planned until a notification is turned on", () => {
  assert.deepEqual(planDailyNotifications(documentWith([]), NOW, text), []);
});

test("each enabled kind is planned at its own time for the coming days", () => {
  const preferences = normalizeNotificationPreferences(null);
  preferences.expenseReminder = { enabled: true, time: "08:00" };
  preferences.dailySummary = { enabled: true, time: "20:00" };
  const planned = planDailyNotifications(
    documentWith([], { notifications: preferences }),
    NOW,
    text,
  );
  const reminders = planned.filter((n) => n.kind === "expenseReminder");
  assert.equal(reminders.length, DAILY_NOTIFICATION_DAYS);
  assert.equal(
    reminders[0].date.getTime(),
    new Date(2026, 9, 27, 8, 0).getTime(),
  );
  assert.equal(reminders[0].identifier, "daily:expenseReminder:2026-10-27");
  assert.equal(
    planned.find((n) => n.kind === "dailySummary").date.getHours(),
    20,
  );
  // A time that already passed today starts tomorrow.
  const late = planDailyNotifications(
    documentWith([], { notifications: only("expenseReminder", "06:30") }),
    NOW,
    text,
  );
  assert.equal(late[0].identifier, "daily:expenseReminder:2026-10-28");
});

test("expense reminder adapts once expenses are logged that day", () => {
  const planned = planDailyNotifications(
    documentWith(
      [
        expense("coffee", 4, new Date(2026, 9, 27, 6, 30)),
        expense("bus", 3, new Date(2026, 9, 27, 6, 45)),
      ],
      { notifications: only("expenseReminder") },
    ),
    NOW,
    text,
  );
  assert.equal(planned[0].title, "loggedTitle");
  assert.equal(planned[0].body, "loggedBody|2");
  assert.equal(planned[1].title, "title");
  assert.equal(planned[0].url, "/transactions/create");
});

test("daily summary cheers only when today is below yesterday and last month", () => {
  const today = new Date(2026, 9, 27, 6, 0);
  const yesterday = new Date(2026, 9, 26, 12, 0);
  const lastMonth = new Date(2026, 8, 27, 12, 0);
  const summary = (transactions, local) =>
    planDailyNotifications(
      documentWith(transactions, {
        notifications: only("dailySummary"),
        local,
      }),
      NOW,
      text,
    )[0];

  const cheer = summary([
    expense("today", 30, today),
    expense("yesterday", 80, yesterday),
    expense("last-month", 50, lastMonth),
  ]);
  assert.equal(cheer.title, "cheerTitle");
  assert.equal(cheer.body, "body|USD 30|USD 80|USD 50");
  assert.equal(cheer.url, "/reports");

  assert.equal(
    summary([expense("today", 30, today), expense("yesterday", 80, yesterday)])
      .title,
    "belowYesterdayTitle",
  );
  assert.equal(
    summary([expense("today", 90, today), expense("y", 80, yesterday)]).title,
    "title",
  );
  assert.equal(summary([]).title, "emptyTitle");
  // Transfers and other profiles never count as spending.
  assert.equal(
    summary([
      expense("transfer", 10, today, { type: 2 }),
      expense("other", 10, today, { user: "someone-else" }),
    ]).title,
    "emptyTitle",
  );
  // Hidden amounts keep figures off the lock screen.
  assert.equal(
    summary([expense("today", 30, today)], { amountsHidden: true }).body,
    "hiddenBody",
  );
});

test("same day last month clamps to the shorter month", () => {
  assert.equal(sameDayLastMonth(new Date(2026, 2, 31)).getDate(), 28);
  assert.equal(sameDayLastMonth(new Date(2026, 0, 15)).getMonth(), 11);
});

test("recurring digest sends one notification for all of today's payments", () => {
  const recurring = (document, id, name, amount, start) =>
    saveRecurring(
      document,
      {
        ...recurringDefaults(),
        name,
        amount: String(amount),
        currencyCode: "USD",
        account: "account-main",
        startAt: start.toISOString(),
      },
      id,
      PROFILE,
      NOW.toISOString(),
    );
  let document = documentWith([], {
    notifications: only("recurringDigest", "12:00"),
  });
  document = recurring(
    document,
    "rent",
    "Rent",
    1200,
    new Date(2026, 9, 27, 9),
  );
  document = recurring(document, "gym", "Gym", 40, new Date(2026, 9, 27, 10));
  document = recurring(
    document,
    "phone",
    "Phone",
    25,
    new Date(2026, 9, 29, 10),
  );

  const planned = planDailyNotifications(document, NOW, text);
  const today = planned.find((n) => n.identifier.endsWith("2026-10-27"));
  assert.equal(today.title, "title|2");
  assert.equal(today.body, "Rent USD 1200, Gym USD 40");
  assert.equal(today.url, "/recurring");
  const single = planned.find((n) => n.identifier.endsWith("2026-10-29"));
  assert.equal(single.title, "singleTitle|Phone");
  assert.equal(single.url, "/recurring/phone");
  // Days without payments send nothing.
  assert.equal(
    planned.some((n) => n.identifier.endsWith("2026-10-28")),
    false,
  );
});
