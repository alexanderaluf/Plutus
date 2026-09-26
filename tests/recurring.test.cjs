const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const root = path.resolve(__dirname, "../src");
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
      (_, relative) => `require(${JSON.stringify(path.join(root, relative))})`,
    );
  module._compile(source, filename);
};
const {
  createLegacyDevelopmentBackup: createDefaultBackup,
} = require("./fixtures/legacy-development-backup.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  createJsonBackupDocument,
  createFullBackupDocument,
} = require("../src/data/backup/document-export.ts");
const {
  recurringDefaults,
  saveRecurring,
  occurrenceDate,
  nextOccurrence,
  occurrenceKey,
  skipRecurring,
  localDateKey,
} = require("../src/data/model/recurring-record.ts");
const { parseExchangeRates } = require("../src/data/model/exchange-rate.ts");
const {
  reconcileRecurring,
  processRecurring,
} = require("../src/data/recurring/recurring-service.ts");
const {
  selectRecurrings,
  selectRecurringSummary,
  selectRecurringEvents,
  selectHomeRecurringPayments,
  selectRecurringTransactionSnapshot,
} = require("../src/data/selectors/recurring-selectors.ts");
const {
  mutateDocument,
  readDocument,
  writeDocument,
} = require("../src/data/database/document-repository.ts");
const { migrateLocalDatabase } = require("../src/data/database/migrations.ts");
const owner = "alex-personal";
const now = new Date(2026, 9, 2, 10);
function fixture() {
  const d = createDefaultBackup();
  d.users.find((u) => u.uuid === owner).currency = "ILS";
  d.accounts = [
    {
      uuid: "checking",
      user: owner,
      name: "Bank",
      currencyCode: "ILS",
      amount: 1000,
      transactions: [],
    },
  ];
  d.transactions = [];
  d.recurrings = [];
  d.exchangeRates = [];
  d.futureCollection = [{ untouched: true }];
  return d;
}
function add(d, changes = {}, id = "subscription") {
  return saveRecurring(
    d,
    {
      ...recurringDefaults(),
      name: "ChatGPT",
      amount: "20",
      currencyCode: "USD",
      account: "checking",
      startAt: new Date(2026, 8, 10, 8).toISOString(),
      automatic: true,
      ...changes,
    },
    id,
    owner,
    new Date(2026, 8, 1).toISOString(),
  );
}
function memory(initial) {
  let value = initial;
  let queue = Promise.resolve();
  return {
    read: async () => structuredClone(value),
    update: (fn) => {
      queue = queue
        .catch(() => {})
        .then(() => {
          value = normalizeBackupDocument(fn(structuredClone(value)));
        });
      return queue;
    },
  };
}
const rates = async (base) =>
  parseExchangeRates(
    {
      date: "2026-10-01",
      [base.toLowerCase()]: { usd: 1, ils: 3.5, eur: 0.92 },
    },
    base,
    now,
  );

test("all seven frequencies preserve the anchor, including leap years and month ends", () => {
  const record = {
    startAt: new Date(2024, 0, 31, 8).toISOString(),
    period: "Monthly",
  };
  assert.equal(localDateKey(occurrenceDate(record, 1)), "2024-02-29");
  assert.equal(localDateKey(occurrenceDate(record, 2)), "2024-03-31");
  assert.equal(
    localDateKey(occurrenceDate({ ...record, period: "Quarterly" }, 1)),
    "2024-04-30",
  );
  assert.equal(
    localDateKey(occurrenceDate({ ...record, period: "Biannually" }, 1)),
    "2024-07-31",
  );
  for (const [period, days] of [
    ["Daily", 1],
    ["Weekly", 7],
    ["Fortnightly", 14],
  ]) {
    const anchor = new Date(2026, 8, 1, 8),
      expected = new Date(2026, 8, 1 + days, 8);
    assert.equal(
      occurrenceDate({ period, startAt: anchor.toISOString() }, 1).getTime(),
      expected.getTime(),
    );
  }
  const leap = {
    period: "Yearly",
    startAt: new Date(2024, 1, 29, 8).toISOString(),
  };
  assert.equal(localDateKey(occurrenceDate(leap, 1)), "2025-02-28");
  assert.equal(localDateKey(occurrenceDate(leap, 4)), "2028-02-29");
});
test("local wall time stays at 08:00 across daylight-saving transitions", () => {
  const previous =
    process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = "America/New_York";
  try {
    const record = { period: "Daily", scheduleStart: "2026-03-07T08:00" };
    assert.equal(occurrenceDate(record, 1).getHours(), 8);
    assert.equal(
      occurrenceDate(record, 1) - occurrenceDate(record, 0),
      23 * 60 * 60 * 1000,
    );
  } finally {
    process.env.TZ = previous;
  }
});
test("October opening catches September, preserves USD subscription and records ILS with dated rate", async () => {
  const store = memory(add(fixture()));
  const result = await reconcileRecurring(store, { now, fetchRates: rates });
  assert.equal(result.error, "");
  const d = await store.read();
  assert.equal(d.recurrings[0].amount, 20);
  assert.equal(d.recurrings[0].currencyCode, "USD");
  assert.equal(d.transactions.length, 1);
  assert.equal(d.transactions[0].amount, 70);
  assert.equal(d.transactions[0].currencyCode, "ILS");
  assert.equal(d.accounts[0].amount, 930);
  assert.equal(localDateKey(new Date(d.transactions[0].date)), "2026-09-10");
  assert.equal(d.transactions[0].processedAt, now.toISOString());
  const snapshot = selectRecurringTransactionSnapshot(
    d,
    d.transactions[0].uuid,
  );
  assert.equal(snapshot.rate, 3.5);
  assert.equal(snapshot.rateDate, "2026-10-01");
  assert.equal(snapshot.originalAmount, 20);
  assert.equal(localDateKey(nextOccurrence(d.recurrings[0])), "2026-10-10");
  await reconcileRecurring(store, { now, fetchRates: rates });
  assert.equal((await store.read()).transactions.length, 1);
});
test("future time and manual/archived schedules are not recorded automatically", async () => {
  let d = add(fixture(), {
    currencyCode: "ILS",
    startAt: new Date(2026, 9, 2, 11).toISOString(),
  });
  d = add(d, { currencyCode: "ILS", automatic: false }, "manual");
  d = add(d, { currencyCode: "ILS" }, "archived");
  d.recurrings[2].archived = true;
  const store = memory(d);
  await reconcileRecurring(store, { now });
  assert.equal((await store.read()).transactions.length, 0);
  await assert.rejects(
    processRecurring(store, "subscription", occurrenceKey(d.recurrings[0]), {
      now,
    }),
    /not due/,
  );
  await processRecurring(store, "manual", occurrenceKey(d.recurrings[1]), {
    now,
    profileId: owner,
  });
  assert.equal((await store.read()).transactions.length, 1);
});
test("missing rates leave foreign payments pending while local income still processes", async () => {
  const store = memory(
    add(add(fixture()), { currencyCode: "ILS", type: 1 }, "salary"),
  );
  const result = await reconcileRecurring(store, {
    now,
    fetchRates: async () => {
      throw Error("Offline");
    },
  });
  const d = await store.read();
  assert.equal(result.error, "Offline");
  assert.equal(d.recurrings[0].nextIndex, 0);
  assert.equal(d.transactions.length, 1);
  assert.equal(d.accounts[0].amount, 1020);
});
test("overlapping process calls and retries cannot duplicate a payment or balance effect", async () => {
  const d = add(fixture(), { currencyCode: "ILS" });
  const store = memory(d),
    key = occurrenceKey(d.recurrings[0]);
  await Promise.all([
    processRecurring(store, "subscription", key, { now }),
    processRecurring(store, "subscription", key, { now }),
  ]);
  const after = await store.read();
  assert.equal(after.transactions.length, 1);
  assert.equal(after.accounts[0].amount, 980);
  assert.equal(after.recurrings[0].occurrences.length, 1);
});
test("skip advances exactly one occurrence, records no transaction and survives backup round trips", async () => {
  const d = add(fixture());
  const key = occurrenceKey(d.recurrings[0]);
  const skipped = skipRecurring(
    d,
    "subscription",
    key,
    owner,
    now.toISOString(),
  );
  assert.equal(skipped.transactions.length, 0);
  assert.equal(skipped.accounts[0].amount, 1000);
  assert.equal(
    skipRecurring(skipped, "subscription", key, owner, now.toISOString()),
    skipped,
  );
  for (const exportDocument of [
    createJsonBackupDocument,
    createFullBackupDocument,
  ]) {
    const restored = normalizeBackupDocument(
      JSON.parse(JSON.stringify(exportDocument(skipped))),
    );
    assert.equal(restored.recurrings[0].occurrences[0].status, "skipped");
    assert.equal(restored.recurrings[0].nextIndex, 1);
    assert.deepEqual(restored.futureCollection, d.futureCollection);
  }
});
test("daily catch-up processes every missed occurrence and resumes bounded runs without loss", async () => {
  const store = memory(
    add(fixture(), {
      currencyCode: "ILS",
      period: "Daily",
      startAt: new Date(2026, 8, 29, 8).toISOString(),
    }),
  );
  await reconcileRecurring(store, { now, limit: 2 });
  assert.equal((await store.read()).transactions.length, 2);
  await reconcileRecurring(store, { now, limit: 2 });
  assert.equal((await store.read()).transactions.length, 4);
  assert.equal(
    localDateKey(nextOccurrence((await store.read()).recurrings[0])),
    "2026-10-03",
  );
});
test("due-this-month excludes processed/skipped expenses, includes future unpaid dates, and separates currencies", async () => {
  let d = add(fixture(), {
    currencyCode: "ILS",
    amount: "10",
    period: "Daily",
    automatic: false,
    startAt: new Date(2026, 9, 1, 8).toISOString(),
    endAt: new Date(2026, 9, 3).toISOString(),
  });
  d = add(
    d,
    { automatic: false, startAt: new Date(2026, 9, 10, 8).toISOString() },
    "usd",
  );
  d = add(
    d,
    {
      currencyCode: "ILS",
      amount: "50",
      type: 1,
      automatic: false,
      startAt: new Date(2026, 9, 10, 8).toISOString(),
    },
    "income",
  );
  d = skipRecurring(
    d,
    "subscription",
    occurrenceKey(d.recurrings[0]),
    owner,
    now.toISOString(),
  );
  const items = selectRecurrings(d, now),
    summary = selectRecurringSummary(items, now);
  assert.deepEqual(summary.due, [
    { currencyCode: "ILS", amount: 20 },
    { currencyCode: "USD", amount: 20 },
  ]);
  assert.equal(
    summary.yearly.find((v) => v.currencyCode === "USD").amount,
    240,
  );
  assert.deepEqual(summary.yearlyIncome, [
    { currencyCode: "ILS", amount: 600 },
  ]);
  assert.deepEqual(summary.yearlyExpense, [
    { currencyCode: "ILS", amount: 3650 },
    { currencyCode: "USD", amount: 240 },
  ]);
  const events = selectRecurringEvents(
    items,
    new Date(2026, 9, 1),
    new Date(2026, 10, 1),
  );
  assert.equal(
    events.filter((v) => v.recurring.id === "subscription").length,
    3,
  );
  assert.equal(events[0].status, "skipped");
});
test("home recurring summary separates paid and unpaid expenses for the current month", () => {
  const d = add(fixture(), {
    currencyCode: "ILS",
    amount: "10",
    period: "Daily",
    automatic: false,
    startAt: new Date(2026, 9, 1, 8).toISOString(),
    endAt: new Date(2026, 9, 3).toISOString(),
  });
  d.recurrings[0].nextIndex = 1;
  d.recurrings[0].occurrences = [
    {
      scheduledAt: new Date(2026, 9, 1, 8).toISOString(),
      status: "processed",
      amount: 10,
      currencyCode: "ILS",
      type: 0,
      transactionId: "paid-transaction",
    },
  ];

  const result = selectHomeRecurringPayments(d, now);
  assert.deepEqual(result.paid, [{ currencyCode: "ILS", amount: 10 }]);
  assert.deepEqual(result.remaining, [{ currencyCode: "ILS", amount: 20 }]);
  assert.equal(result.pending.length, 2);
});
test("end dates are inclusive and a completed schedule cannot run again", async () => {
  const store = memory(
    add(fixture(), {
      currencyCode: "ILS",
      period: "Daily",
      startAt: new Date(2026, 8, 29, 8).toISOString(),
      endAt: new Date(2026, 8, 30).toISOString(),
    }),
  );
  await reconcileRecurring(store, { now });
  const d = await store.read();
  assert.equal(d.transactions.length, 2);
  assert.equal(nextOccurrence(d.recurrings[0]), null);
  assert.equal(selectRecurrings(d, now)[0].archived, true);
});
test("concurrent edit during exchange-rate lookup cannot commit a stale payout", async () => {
  const d = add(fixture()),
    store = memory(d);
  await assert.rejects(
    processRecurring(store, "subscription", occurrenceKey(d.recurrings[0]), {
      now,
      fetchRates: async (base) => {
        await store.update((current) => ({
          ...current,
          recurrings: current.recurrings.map((r) => ({ ...r, amount: 99 })),
        }));
        return rates(base);
      },
    }),
    /changed/,
  );
  assert.equal((await store.read()).transactions.length, 0);
});
test("a third-currency account is converted directly without intermediate rounding loss", async () => {
  const d = fixture();
  d.accounts[0].currencyCode = "EUR";
  const store = memory(add(d, { amount: "0.02" }));
  await reconcileRecurring(store, {
    now,
    fetchRates: async (base) =>
      parseExchangeRates(
        { date: "2026-10-02", usd: { usd: 1, ils: 0.27, eur: 0.92 } },
        base,
        now,
      ),
  });
  const after = await store.read();
  assert.equal(after.transactions[0].amount, 0.01);
  assert.equal(after.transactions[0].accountAmount, 0.02);
  assert.equal(after.accounts[0].amount, 999.98);
  assert.equal(after.transactions[0].originalAmount, 0.02);
});
test("local reminders deduplicate and obsolete reminders are cancelled after skipping", async () => {
  const filename = path.join(root, "data/recurring/recurring-reminders.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let scheduled = [],
    calls = 0;
  const notifications = {
    setNotificationHandler: () => {},
    getPermissionsAsync: async () => ({ granted: true }),
    getAllScheduledNotificationsAsync: async () => scheduled,
    cancelScheduledNotificationAsync: async (id) => {
      scheduled = scheduled.filter((n) => n.identifier !== id);
    },
    scheduleNotificationAsync: async (value) => {
      calls++;
      scheduled.push(value);
    },
    SchedulableTriggerInputTypes: { DATE: "date" },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) =>
      name === "expo"
        ? { isRunningInExpoGo: () => false }
        : name === "expo-notifications"
          ? notifications
          : name === "react-native"
            ? { Platform: { OS: "ios" } }
            : name.startsWith("@/")
              ? require(path.join(root, name.slice(2)))
              : require(path.resolve(path.dirname(filename), name)),
    loaded,
    loaded.exports,
  );
  const d = add(fixture(), {
    startAt: new Date(2026, 9, 5, 8).toISOString(),
    reminderDays: 1,
  });
  await loaded.exports.syncRecurringReminders(d, now);
  await loaded.exports.syncRecurringReminders(d, now);
  assert.equal(calls, 1);
  assert.equal(scheduled.length, 1);
  assert.equal(localDateKey(scheduled[0].trigger.date), "2026-10-04");
  const skipped = skipRecurring(
    d,
    "subscription",
    occurrenceKey(d.recurrings[0]),
    owner,
    now.toISOString(),
  );
  await loaded.exports.syncRecurringReminders(skipped, now);
  assert.equal(scheduled.length, 1);
  assert.equal(localDateKey(scheduled[0].trigger.date), "2026-11-04");
  skipped.recurrings[0].archived = true;
  await loaded.exports.syncRecurringReminders(skipped, now);
  assert.equal(scheduled.length, 0);
});
test("migration defaults automatic off and atomic repository rolls back ledger and balances on failure", async () => {
  const db = new DatabaseSync(":memory:");
  const adapter = {
    execAsync: async (sql) => db.exec(sql),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    withExclusiveTransactionAsync: async (work) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        await work(adapter);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
  try {
    await migrateLocalDatabase(adapter);
    const imported = add(fixture());
    delete imported.recurrings[0].automatic;
    imported.recurrings[0].foreign = { keep: true };
    await writeDocument(adapter, imported);
    assert.equal((await readDocument(adapter)).recurrings[0].automatic, false);
    const before = await readDocument(adapter);
    await assert.rejects(
      mutateDocument(adapter, (d) => {
        d.accounts[0].amount = 0;
        d.recurrings[0].nextIndex = 500;
        throw Error("Commit failed");
      }),
    );
    assert.deepEqual(await readDocument(adapter), before);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 21);
  } finally {
    db.close();
  }
});
