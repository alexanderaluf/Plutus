const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync, backup } = require("node:sqlite");
const ts = require("typescript");
const sourceRoot = path.resolve(__dirname, "../src");
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
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const { createDemoBackup } = require("../src/data/model/demo-backup.ts");
const {
  completeSetup,
  getSetupStatus,
  withBaseCategories,
  formatAppDate,
  getPersonalMonthStart,
  getCalendarOffset,
} = require("../src/data/model/onboarding.ts");
const {
  normalizeBackupDocument,
} = require("../src/data/model/normalize-backup.ts");
const {
  migrateLocalDatabase,
  DATABASE_VERSION,
} = require("../src/data/database/migrations.ts");
const {
  readDocument,
  mutateDocument,
  writeDocument,
} = require("../src/data/database/document-repository.ts");
const {
  BACKUP_COLLECTION_KEYS,
  LOCAL_SCHEMA_VERSION,
} = require("../src/data/model/backup-document.ts");
const {
  createJsonBackupDocument,
} = require("../src/data/backup/document-export.ts");
const now = "2026-09-14T12:00:00.000Z";
const values = {
  name: " Alex ",
  language: "he",
  currency: "ILS",
  currencyName: "Israeli New Shekel",
  currencySymbol: "₪",
  dateFormat: "DD/MM/YYYY",
  monthStartDay: 10,
  weekStartDay: 0,
  backupAccepted: true,
  responsibilityAccepted: true,
};
function adapter(filename = ":memory:") {
  const sql = new DatabaseSync(filename);
  const db = {
    sql,
    fault: null,
    execAsync: async (statement) => {
      if (db.fault?.(statement)) throw new Error("injected failure");
      sql.exec(statement);
    },
    getFirstAsync: async (statement, ...args) =>
      sql.prepare(statement).get(...args),
    getAllAsync: async (statement, ...args) =>
      sql.prepare(statement).all(...args),
    runAsync: async (statement, ...args) => {
      if (db.fault?.(statement)) throw new Error("injected failure");
      return sql.prepare(statement).run(...args);
    },
    withExclusiveTransactionAsync: async (work) => {
      sql.exec("BEGIN IMMEDIATE");
      try {
        await work(db);
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return db;
}
function seed(db, document, version = 16) {
  db.sql.exec(
    `CREATE TABLE app_document (id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL, document_json TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = ${version}`,
  );
  db.sql
    .prepare("INSERT INTO app_document VALUES (1, ?, ?, ?)")
    .run(version, JSON.stringify(document), now);
}
const raw = (db) =>
  db.sql.prepare("SELECT document_json FROM app_document WHERE id = 1").get()
    .document_json;
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test("production startup creates categories only; no implicit demo or fallback user", async () => {
  const db = adapter();
  try {
    await migrateLocalDatabase(db);
    const d = await readDocument(db);
    assert.equal(getSetupStatus(d), "setup");
    assert.equal(d.categories.length, 18);
    for (const key of BACKUP_COLLECTION_KEYS)
      if (key !== "categories") assert.deepEqual(d[key], []);
    assert.equal(d._local.selectedProfileId, null);
    assert.equal(d._local.cloudProvider, null);
    await migrateLocalDatabase(db, true);
    assert.deepEqual(await readDocument(db), d);
  } finally {
    db.sql.close();
  }
});

test("all choices commit together; restart and JSON restore retain preferences", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "plutus-onboarding-"),
  );
  const filename = path.join(directory, "db.sqlite");
  let db = adapter(filename);
  try {
    await migrateLocalDatabase(db);
    const before = raw(db);
    for (const invalid of [
      { backupAccepted: false },
      { responsibilityAccepted: false },
      { name: " " },
      { currency: "bad" },
      { monthStartDay: 32 },
      { monthStartDay: 1.5 },
      { weekStartDay: 7 },
      { dateFormat: "MM/DD/YYYYY" },
    ]) {
      await assert.rejects(
        mutateDocument(db, (current) =>
          completeSetup(current, { ...values, ...invalid }, "user", now),
        ),
      );
      assert.equal(raw(db), before);
    }
    const result = await mutateDocument(db, (current) =>
      completeSetup(current, values, "user", now),
    );
    assert.equal(result.users[0].name, "Alex");
    assert.equal(result.accounts.length, 0);
    assert.equal(result._local.monthStartDay, 10);
    assert.equal(result._local.weekStartDay, 0);
    assert.equal(result._local.mainCurrency, "ILS");
    assert.equal(result._local.onboardingCompletedAt, now);
    assert.equal(result._local.backupResponsibilityAcceptedAt, now);
    db.sql.close();
    db = adapter(filename);
    await migrateLocalDatabase(db, true);
    assert.deepEqual(await readDocument(db), result);
    const restored = normalizeBackupDocument(
      JSON.parse(JSON.stringify(createJsonBackupDocument(result))),
    );
    assert.equal(restored._local.appLanguage, "he");
    assert.equal(restored._local.dateFormat, "DD/MM/YYYY");
    assert.equal(getSetupStatus(restored), "ready");
    await assert.rejects(
      mutateDocument(db, (current) =>
        completeSetup(current, values, "duplicate", now),
      ),
    );
  } finally {
    db.sql.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("demo is explicit, has connected data and can return to empty setup atomically", async () => {
  const demo = createDemoBackup("user", "ILS", new Date(now));
  const result = completeSetup(
    createDefaultBackup(),
    values,
    "user",
    now,
    demo,
  );
  assert.equal(result._local.dataMode, "demo");
  assert.equal(result.transactions.length, 93);
  assert.equal(result.accounts.length, 3);
  assert.equal(result.budgets.length, 2);
  for (const tx of result.transactions) {
    assert.equal(tx.user, "user");
    assert.equal(tx.currencyCode, "ILS");
    assert.ok(result.categories.some((c) => c.uuid === tx.category));
    assert.ok(
      result.accounts.some(
        (a) => a.uuid === tx.account && a.transactions.includes(tx.uuid),
      ),
    );
  }
  const db = adapter();
  try {
    await migrateLocalDatabase(db);
    await writeDocument(db, result);
    await mutateDocument(db, () => createDefaultBackup());
    await migrateLocalDatabase(db, true);
    assert.equal(getSetupStatus(await readDocument(db)), "setup");
  } finally {
    db.sql.close();
  }
});

test("restore merges base categories without overwriting imported edits or colliding numeric IDs", () => {
  const document = completeSetup(createDefaultBackup(), values, "user", now);
  document.categories = [
    { uuid: "category-food", id: 1, name: "Custom food", custom: [42] },
    { uuid: "custom", id: 2, name: "Personal" },
  ];
  document.unknown = { records: [1, 2, 3] };
  const next = withBaseCategories(document);
  assert.deepEqual(next.categories.slice(0, 2), document.categories);
  assert.equal(next.categories.length, 19);
  assert.equal(new Set(next.categories.map((c) => c.id)).size, 19);
  assert.deepEqual(next.unknown, document.unknown);
  assert.deepEqual(withBaseCategories(next), next);
});

test("pre-v5 upgrade restores the legacy bank/card relationship without replacing records", async () => {
  const {
    createLegacyDevelopmentBackup,
  } = require("./fixtures/legacy-development-backup.ts");
  const document = createLegacyDevelopmentBackup();
  document._local.schemaVersion = 4;
  const bank = document.accounts.find(
    (account) => account.uuid === "account-checking",
  );
  const card = document.accounts.find(
    (account) => account.uuid === "account-credit",
  );
  delete bank.accountType;
  delete card.linkedBankAccountId;
  delete card.paymentDay;
  bank.custom = { keep: "bank" };
  card.custom = { keep: "card" };
  const db = adapter();
  try {
    seed(db, document, 4);
    await migrateLocalDatabase(db);
    const migrated = await readDocument(db);
    const migratedBank = migrated.accounts.find(
      (account) => account.uuid === "account-checking",
    );
    const migratedCard = migrated.accounts.find(
      (account) => account.uuid === "account-credit",
    );
    assert.equal(migratedBank.accountType, "bank");
    assert.equal(migratedBank.type, 3);
    assert.deepEqual(migratedBank.custom, { keep: "bank" });
    assert.equal(migratedCard.linkedBankAccountId, "account-checking");
    assert.equal(migratedCard.paymentDay, 10);
    assert.deepEqual(migratedCard.custom, { keep: "card" });
  } finally {
    db.sql.close();
  }
});

test("deterministic randomized upgrades from every historical version preserve every record and unknown key", async () => {
  for (let version = 1; version <= 16; version++)
    for (let trial = 1; trial <= 5; trial++) {
      const rand = random(version * 100 + trial);
      const d = completeSetup(
        createDefaultBackup(),
        values,
        `user-${trial}`,
        now,
      );
      d._local.schemaVersion = version;
      delete d._local.onboardingCompletedAt;
      delete d._local.dateFormat;
      d.futureCollection = [
        { uuid: "future", nested: { values: [rand(), "עברית", null] } },
      ];
      d._local.futurePreference = { keep: true };
      for (const key of BACKUP_COLLECTION_KEYS.filter(
        (k) => !["users", "categories"].includes(k),
      )) {
        d[key] = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) => ({
          uuid: `${key}-${trial}-${i}`,
          name: `Record ${i}`,
          user: `user-${trial}`,
          amount: Math.round(rand() * 100000) / 100,
          type: i % 2,
          createdAt: now,
          updatedAt: now,
          custom: { original: rand(), linked: `user-${trial}` },
        }));
      }
      const db = adapter();
      try {
        seed(db, d, version);
        // Completely rebuild the physical table with reordered columns, an extra
        // column and an unrelated future table. The stable envelope remains readable.
        db.sql.exec(
          "ALTER TABLE app_document RENAME TO historical; CREATE TABLE app_document (future TEXT DEFAULT 'keep', document_json TEXT NOT NULL, updated_at TEXT NOT NULL, id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL); INSERT INTO app_document (document_json, updated_at, id, schema_version) SELECT document_json, updated_at, id, schema_version FROM historical; DROP TABLE historical; CREATE TABLE plugin_records (id TEXT PRIMARY KEY, value TEXT); INSERT INTO plugin_records VALUES ('one', 'preserved');",
        );
        const original = raw(db);
        await migrateLocalDatabase(db);
        const next = await readDocument(db);
        assert.equal(next._local.schemaVersion, LOCAL_SCHEMA_VERSION);
        assert.equal(getSetupStatus(next), "ready");
        assert.deepEqual(next.users, d.users);
        for (const key of BACKUP_COLLECTION_KEYS) {
          assert.equal(next[key].length, d[key].length);
          for (let i = 0; i < d[key].length; i++) {
            assert.equal(next[key][i].uuid, d[key][i].uuid);
            if (d[key][i].custom)
              assert.deepEqual(next[key][i].custom, d[key][i].custom);
            if (d[key][i].amount !== undefined)
              assert.equal(next[key][i].amount, d[key][i].amount);
          }
        }
        assert.deepEqual(next.futureCollection, d.futureCollection);
        assert.deepEqual(
          next._local.futurePreference,
          d._local.futurePreference,
        );
        assert.equal(
          db.sql.prepare("SELECT future FROM app_document").get().future,
          "keep",
        );
        assert.equal(
          db.sql.prepare("SELECT value FROM plugin_records").get().value,
          "preserved",
        );
        assert.equal(
          db.sql
            .prepare("SELECT document_json FROM app_migration_snapshots")
            .get().document_json,
          original,
        );
        const committed = raw(db);
        await migrateLocalDatabase(db, true);
        assert.equal(raw(db), committed);
        assert.equal(
          db.sql
            .prepare("SELECT COUNT(*) AS n FROM app_migration_snapshots")
            .get().n,
          1,
        );
      } finally {
        db.sql.close();
      }
    }
});

test("failure at each SQL mutation rolls back document, version, schema and checkpoint; retry succeeds", async () => {
  for (const match of [
    "CREATE TABLE IF NOT EXISTS app_migration_snapshots",
    "INSERT INTO app_migration_snapshots",
    "UPDATE app_document",
    "CREATE TABLE IF NOT EXISTS app_storage_identity",
    "INSERT OR IGNORE INTO app_storage_identity",
    "PRAGMA user_version = 17",
  ]) {
    const db = adapter();
    try {
      const d = completeSetup(createDefaultBackup(), values, "user", now);
      d._local.schemaVersion = 16;
      seed(db, d);
      const original = raw(db);
      db.fault = (statement) => statement.startsWith(match);
      await assert.rejects(migrateLocalDatabase(db), /injected failure/);
      assert.equal(raw(db), original);
      assert.equal(
        db.sql.prepare("PRAGMA user_version").get().user_version,
        16,
      );
      assert.equal(
        db.sql
          .prepare(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'app_migration_snapshots'",
          )
          .get().n,
        0,
      );
      db.fault = null;
      await migrateLocalDatabase(db);
      assert.equal((await readDocument(db)).users[0].uuid, "user");
    } finally {
      db.sql.close();
    }
  }
});

test("unknown layouts, future versions, missing row/users and corrupt JSON stop without reseeding", async () => {
  for (const change of [
    (db) => db.sql.exec("ALTER TABLE app_document RENAME TO renamed_document"),
    (db) =>
      db.sql.exec(
        "ALTER TABLE app_document RENAME COLUMN document_json TO payload",
      ),
    (db) => db.sql.exec("DELETE FROM app_document"),
    (db) => db.sql.exec("PRAGMA user_version = 999"),
    (db) => db.sql.exec("UPDATE app_document SET document_json = '{broken'"),
    (db) => db.sql.exec("UPDATE app_document SET document_json = '{}'"),
    (db) =>
      db.sql
        .prepare("UPDATE app_document SET document_json = ?")
        .run(JSON.stringify(createDefaultBackup())),
    (db) => {
      const d = JSON.parse(raw(db));
      d.users = [];
      db.sql
        .prepare("UPDATE app_document SET document_json = ?")
        .run(JSON.stringify(d));
    },
    (db) => {
      const d = JSON.parse(raw(db));
      d.users = { renamed: d.users };
      db.sql
        .prepare("UPDATE app_document SET document_json = ?")
        .run(JSON.stringify(d));
    },
  ]) {
    const db = adapter();
    try {
      const d = completeSetup(createDefaultBackup(), values, "user", now);
      d._local.schemaVersion = 16;
      seed(db, d);
      change(db);
      const before = db.sql
        .prepare("SELECT sql FROM sqlite_master ORDER BY name")
        .all();
      await assert.rejects(migrateLocalDatabase(db));
      assert.deepEqual(
        db.sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(),
        before,
      );
    } finally {
      db.sql.close();
    }
  }
  const missingDatabase = adapter();
  try {
    await assert.rejects(migrateLocalDatabase(missingDatabase, true));
    assert.equal(
      missingDatabase.sql
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master")
        .get().n,
      0,
    );
  } finally {
    missingDatabase.sql.close();
  }
});

test("independent identity guard detects a document accidentally replaced with pristine defaults", async () => {
  const db = adapter();
  try {
    await migrateLocalDatabase(db);
    await mutateDocument(db, (d) => completeSetup(d, values, "user", now));
    db.sql
      .prepare("UPDATE app_document SET document_json = ?")
      .run(JSON.stringify(createDefaultBackup()));
    await assert.rejects(migrateLocalDatabase(db, true));
    await assert.rejects(readDocument(db));
    await assert.rejects(
      mutateDocument(db, (d) => completeSetup(d, values, "replacement", now)),
    );
  } finally {
    db.sql.close();
  }
});

test("deleting the identity guard cannot turn an established database into a new installation", async () => {
  const db = adapter();
  try {
    await migrateLocalDatabase(db);
    await mutateDocument(db, (d) => completeSetup(d, values, "user", now));
    db.sql.exec("DROP TABLE app_storage_identity");
    const before = raw(db);
    await assert.rejects(migrateLocalDatabase(db, true));
    assert.equal(raw(db), before);
  } finally {
    db.sql.close();
  }
});

test("setup commit failure leaves no partial profile or identity; retry creates one user", async () => {
  const db = adapter();
  try {
    await migrateLocalDatabase(db);
    const original = raw(db);
    db.fault = (statement) =>
      statement.startsWith("UPDATE app_storage_identity");
    await assert.rejects(
      mutateDocument(db, (d) => completeSetup(d, values, "user", now)),
    );
    assert.equal(raw(db), original);
    db.fault = null;
    await mutateDocument(db, (d) => completeSetup(d, values, "user", now));
    assert.equal((await readDocument(db)).users.length, 1);
  } finally {
    db.sql.close();
  }
});

test("dates, payday boundaries, leap years and year transitions are deterministic", () => {
  assert.equal(
    formatAppDate(new Date(2026, 8, 14), "MM/DD/YYYY"),
    "09/14/2026",
  );
  assert.equal(formatAppDate(new Date(2026, 8, 14), "DD/MM/YY"), "14/09/26");
  assert.equal(
    getPersonalMonthStart(new Date(2026, 0, 9), 10).getFullYear(),
    2025,
  );
  assert.equal(getPersonalMonthStart(new Date(2026, 8, 10), 10).getDate(), 10);
  assert.equal(getPersonalMonthStart(new Date(2024, 1, 29), 31).getDate(), 29);
  assert.equal(getPersonalMonthStart(new Date(2026, 1, 28), 31).getDate(), 28);
  for (let weekday = 0; weekday < 7; weekday++) {
    const month = new Date(2026, 8, 1);
    assert.equal(
      (getCalendarOffset(month, weekday) + weekday) % 7,
      month.getDay(),
    );
  }
});

test("native startup checkpoint contract: reopen a full pre-upgrade SQLite copy; retain it on retries; block renamed database", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "plutus-checkpoint-"),
  );
  let failWrites = false;
  class Directory {
    constructor(...parts) {
      this.uri = path.join(...parts.map((p) => p.uri ?? p));
    }
    create() {
      fs.mkdirSync(this.uri, { recursive: true });
    }
  }
  class File {
    constructor(...parts) {
      this.uri = path.join(...parts.map((p) => p.uri ?? p));
    }
    get exists() {
      return fs.existsSync(this.uri);
    }
    get size() {
      return fs.statSync(this.uri).size;
    }
    create() {
      fs.writeFileSync(this.uri, "");
    }
    write(value) {
      if (failWrites) throw new Error("disk full");
      fs.writeFileSync(this.uri, value);
    }
    move(destination) {
      fs.renameSync(this.uri, destination.uri);
      this.uri = destination.uri;
    }
  }
  const filename = path.join(sourceRoot, "data/database/safe-startup.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) =>
      name === "expo-file-system"
        ? { Directory, File, Paths: { document: directory } }
        : require(path.resolve(path.dirname(filename), name)),
    module,
    module.exports,
  );
  const initialize = module.exports.initializeLocalDatabase;
  const db = adapter(path.join(directory, "source.sqlite"));
  // Test the platform adapter contract using node:sqlite's online backup API.
  // Actual Expo serializeAsync execution still requires a native-device smoke test.
  db.serializeAsync = async () => {
    const file = path.join(directory, `serialized-${Math.random()}.sqlite`);
    await backup(db.sql, file);
    const bytes = fs.readFileSync(file);
    fs.unlinkSync(file);
    return bytes;
  };
  db.closeAsync = async () => {};
  try {
    const d = completeSetup(createDefaultBackup(), values, "kept-user", now);
    d._local.schemaVersion = 16;
    seed(db, d);
    db.sql.exec(
      "CREATE TABLE unknown_extension (value TEXT); INSERT INTO unknown_extension VALUES ('keep me');",
    );
    const original = raw(db);
    failWrites = true;
    await assert.rejects(initialize(db), /disk full/);
    assert.equal(raw(db), original);
    assert.equal(db.sql.prepare("PRAGMA user_version").get().user_version, 16);
    failWrites = false;
    db.fault = (statement) => statement.startsWith("UPDATE app_document");
    await assert.rejects(initialize(db), /injected failure/);
    const checkpointPath = path.join(
      directory,
      "storage-recovery",
      "before-v17.sqlite",
    );
    const checkpointBytes = fs.readFileSync(checkpointPath);
    const checkpoint = new DatabaseSync(checkpointPath, { readOnly: true });
    assert.equal(
      checkpoint.prepare("SELECT document_json FROM app_document").get()
        .document_json,
      original,
    );
    assert.equal(
      checkpoint.prepare("SELECT value FROM unknown_extension").get().value,
      "keep me",
    );
    checkpoint.close();
    db.fault = null;
    await initialize(db);
    assert.deepEqual(fs.readFileSync(checkpointPath), checkpointBytes);
    assert.equal((await readDocument(db)).users[0].uuid, "kept-user");
    const wrongDatabase = adapter();
    wrongDatabase.serializeAsync = async () => new Uint8Array();
    wrongDatabase.closeAsync = async () => {};
    try {
      await assert.rejects(initialize(wrongDatabase));
      assert.equal(
        wrongDatabase.sql
          .prepare("SELECT COUNT(*) AS n FROM sqlite_master")
          .get().n,
        0,
      );
    } finally {
      wrongDatabase.sql.close();
    }
  } finally {
    db.sql.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Paisa v3 document, CSV quoted fields, JSON stripping and ZIP media round trips retain setup and unknown data", async () => {
  const { zipSync, strToU8 } = require("fflate");
  const {
    transactionsToCsv,
    transactionsFromCsv,
  } = require("../src/data/backup/csv-backup.ts");
  const { parseZipBackup } = require("../src/data/backup/zip-codec.ts");
  const {
    createLegacyDevelopmentBackup,
  } = require("./fixtures/legacy-development-backup.ts");
  const d = normalizeBackupDocument(createLegacyDevelopmentBackup());
  d._local.monthStartDay = 10;
  d._local.weekStartDay = 0;
  d._local.dateFormat = "YYYY/MM/DD";
  d.transactions[0].name = 'Coffee, "quoted"\nsecond line';
  d.transactions[0].custom = { keep: true };
  d.users[0].image = "receipt.jpg";
  d._local.attachments = [
    {
      id: "receipt",
      fileName: "receipt.jpg",
      relativePath: "receipt.jpg",
      mimeType: "image/jpeg",
      size: 3,
    },
  ];
  d.unknownCollection = [{ uuid: "extra", value: "keep" }];
  const csv = transactionsFromCsv(transactionsToCsv(d.transactions));
  assert.equal(csv[0].name, d.transactions[0].name);
  assert.deepEqual(csv[0].custom, { keep: true });
  const json = normalizeBackupDocument(
    JSON.parse(JSON.stringify(createJsonBackupDocument(d))),
  );
  assert.equal(json.users[0].image, null);
  assert.deepEqual(json._local.attachments, []);
  assert.equal(json._local.monthStartDay, 10);
  assert.equal(json._local.dateFormat, "YYYY/MM/DD");
  assert.deepEqual(json.unknownCollection, d.unknownCollection);
  const files = {
    "backup.json": strToU8(JSON.stringify(d)),
    "attachments/receipt.jpg": new Uint8Array([1, 2, 3]),
  };
  const zip = parseZipBackup(zipSync(files));
  assert.deepEqual(zip.attachments[0].data, files["attachments/receipt.jpg"]);
  assert.equal(zip.document._local.monthStartDay, 10);
  assert.throws(() =>
    parseZipBackup(zipSync({ "backup.json": files["backup.json"] })),
  );
  assert.throws(() =>
    parseZipBackup(
      zipSync({ ...files, "attachments/../escape": new Uint8Array([1]) }),
    ),
  );
  const filename = path.join(sourceRoot, "data/backup/zip-backup.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) =>
      name === "../attachments/attachment-store"
        ? { getAttachmentFile: () => ({ exists: false }) }
        : name.startsWith("@/")
          ? require(path.join(sourceRoot, name.slice(2)))
          : name.startsWith(".")
            ? require(path.resolve(path.dirname(filename), name))
            : require(name),
    module,
    module.exports,
  );
  await assert.rejects(module.exports.createZipBackup(d));
});
