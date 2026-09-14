const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
require.extensions[".ts"] = (module, filename) => {
  const code = ts
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
  module._compile(code, filename);
};

const {
  BACKUP_COLLECTION_KEYS,
} = require("../src/data/model/backup-document.ts");
const { createDefaultBackup } = require("../src/data/model/default-backup.ts");
const { completeSetup } = require("../src/data/model/onboarding.ts");
const { deleteProfileData } = require("../src/data/model/profile-record.ts");
const { migrateLocalDatabase } = require("../src/data/database/migrations.ts");
const {
  mutateDocument,
  readDocument,
  writeDocument,
} = require("../src/data/database/document-repository.ts");
const { getSetupStatus } = require("../src/data/model/onboarding.ts");

const setupValues = {
  name: "Delete me",
  language: "en",
  currency: "USD",
  currencyName: "US Dollar",
  currencySymbol: "$",
  dateFormat: "DD/MM/YYYY",
  monthStartDay: 1,
  weekStartDay: 0,
  backupAccepted: true,
  responsibilityAccepted: true,
};

function documentWithTwoProfiles() {
  const document = completeSetup(
    createDefaultBackup(),
    setupValues,
    "target-profile",
    "2026-09-14T12:00:00.000Z",
  );
  document.users[0].id = 7;
  document.users[0].image = "target-profile.jpg";
  document.users.push({
    id: 8,
    uuid: "kept-profile",
    name: "Keep me",
    currency: "EUR",
    image: "kept-profile.jpg",
    isSelected: false,
  });
  for (const key of BACKUP_COLLECTION_KEYS) {
    if (["users", "categories", "exchangeRates"].includes(key)) continue;
    document[key] = [
      { uuid: `target-${key}`, user: 7, custom: { keepShape: true } },
      { uuid: `kept-${key}`, user: "kept-profile", custom: { keep: true } },
      { uuid: `global-${key}`, custom: { global: true } },
    ];
  }
  document.accounts[0].transactions = [
    "target-transactions",
    "legacy-linked-transaction",
  ];
  document.transactions.push({
    uuid: "legacy-linked-transaction",
    account: "target-accounts",
    receiptAttachmentId: "target-receipt",
    receipt: "target-receipt.jpg",
  });
  document.categories.push(
    { uuid: "target-category", user: "target-profile" },
    { uuid: "target-category-child", parentId: "target-category" },
    {
      uuid: "kept-category",
      user: "kept-profile",
      transactions: ["target-transactions", "kept-transactions"],
    },
  );
  document.budgets.push({
    uuid: "legacy-linked-budget",
    accounts: ["target-accounts"],
  });
  document.billParticipants.push({
    uuid: "legacy-linked-participant",
    billSplitterId: "target-billSplitters",
  });
  document.images.push({
    uuid: "legacy-linked-image",
    transactionId: "legacy-linked-transaction",
  });
  document._local.attachments = [
    {
      id: "target-profile-photo",
      fileName: "target-profile.jpg",
      mimeType: "image/jpeg",
      relativePath: "target-profile.jpg",
      size: 1,
    },
    {
      id: "target-receipt",
      fileName: "target-receipt.jpg",
      mimeType: "image/jpeg",
      relativePath: "target-receipt.jpg",
      size: 1,
    },
    {
      id: "kept-photo",
      fileName: "kept-profile.jpg",
      mimeType: "image/jpeg",
      relativePath: "kept-profile.jpg",
      size: 1,
    },
  ];
  document.futureCollection = [{ uuid: "unknown", preserve: true }];
  document.goals.push({ user: 7, name: "idless legacy goal" });
  return document;
}

function databaseAdapter() {
  const sql = new DatabaseSync(":memory:");
  const database = {
    sql,
    fault: null,
    execAsync: async (statement) => {
      if (database.fault?.(statement)) throw new Error("injected failure");
      sql.exec(statement);
    },
    getFirstAsync: async (statement, ...args) =>
      sql.prepare(statement).get(...args),
    getAllAsync: async (statement, ...args) =>
      sql.prepare(statement).all(...args),
    runAsync: async (statement, ...args) => {
      if (database.fault?.(statement)) throw new Error("injected failure");
      return sql.prepare(statement).run(...args);
    },
    withExclusiveTransactionAsync: async (work) => {
      sql.exec("BEGIN IMMEDIATE");
      try {
        await work(database);
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return database;
}

function mountManageProfilesScreen() {
  const slots = [];
  let cursor = 0;
  const profiles = [
    {
      id: "profile-one",
      name: "Profile one",
      email: "one@local.profile",
      initials: "PO",
      color: "#70d2eb",
      role: "Personal",
      currencyCode: "USD",
      currencyName: "US Dollar",
      currencySymbol: "$",
    },
  ];
  const filename = path.join(
    sourceRoot,
    "features/profile/manage-profiles-screen.tsx",
  );
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => {
      const mocks = {
        react: {
          useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = initial;
            return [
              slots[index],
              (value) => {
                slots[index] =
                  typeof value === "function" ? value(slots[index]) : value;
              },
            ];
          },
        },
        "expo-router": { useRouter: () => ({ push() {} }) },
        "react-native": { ScrollView: "ScrollView" },
        "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
        "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
        "@/shared/theme/app-theme": {
          useAppThemeColors: () => ({ background: "#fff" }),
        },
        "./components/profile-list": { ProfileList: "ProfileList" },
        "./components/profile-delete-sheet": {
          ProfileDeleteSheet: "ProfileDeleteSheet",
        },
        "./components/profile-screen-header": {
          ProfileScreenHeader: "ProfileScreenHeader",
        },
        "./profile-provider": {
          useProfiles: () => ({
            profiles,
            activeProfileId: profiles[0].id,
            selectProfile() {},
          }),
        },
      };
      return mocks[name] ?? require(name);
    },
    module,
    module.exports,
  );
  let tree;
  const nodes = () => {
    const result = [];
    const visited = new Set();
    function visit(node) {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === "object" && !visited.has(node)) {
        visited.add(node);
        result.push(node);
        visit(node.props?.children);
      }
    }
    visit(tree);
    return result;
  };
  const render = () => {
    cursor = 0;
    tree = module.exports.ManageProfilesScreen();
  };
  render();
  return { profiles, nodes, render };
}

test("deleting a profile cascades all owned and linked records while preserving other and global data", () => {
  const current = documentWithTwoProfiles();
  const result = deleteProfileData(current, "target-profile");
  const next = result.document;

  assert.deepEqual(next.futureCollection, current.futureCollection);
  assert.deepEqual(
    next.users.map((user) => user.uuid),
    ["kept-profile"],
  );
  assert.equal(next.users[0].isSelected, true);
  assert.equal(next._local.selectedProfileId, "kept-profile");
  for (const key of BACKUP_COLLECTION_KEYS) {
    if (["users", "categories", "exchangeRates"].includes(key)) continue;
    assert.equal(
      next[key].some((record) => record.user === 7),
      false,
      key,
    );
    assert.ok(
      next[key].some((record) => record.uuid === `kept-${key}`),
      key,
    );
    assert.ok(
      next[key].some((record) => record.uuid === `global-${key}`),
      key,
    );
  }
  assert.equal(
    next.transactions.some(
      (record) => record.uuid === "legacy-linked-transaction",
    ),
    false,
  );
  assert.equal(
    next.categories.some((record) => record.uuid === "target-category-child"),
    false,
  );
  assert.equal(
    next.budgets.some((record) => record.uuid === "legacy-linked-budget"),
    false,
  );
  assert.equal(
    next.billParticipants.some(
      (record) => record.uuid === "legacy-linked-participant",
    ),
    false,
  );
  assert.equal(
    next.images.some((record) => record.uuid === "legacy-linked-image"),
    false,
  );
  assert.deepEqual(
    next.categories.find((record) => record.uuid === "kept-category")
      .transactions,
    ["kept-transactions"],
  );
  assert.deepEqual(result.attachmentPaths.sort(), [
    "target-profile.jpg",
    "target-receipt.jpg",
  ]);
  assert.deepEqual(
    next._local.attachments.map((attachment) => attachment.relativePath),
    ["kept-profile.jpg"],
  );
  assert.equal(
    next.goals.some((record) => record.name === "idless legacy goal"),
    false,
  );
});

test("deleting the last profile returns to categories-only setup and removes every attachment", () => {
  const current = completeSetup(
    createDefaultBackup(),
    setupValues,
    "only-profile",
    "2026-09-14T12:00:00.000Z",
  );
  current.accounts.push({ uuid: "account", user: "only-profile" });
  current._local.attachments.push({
    id: "photo",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    relativePath: "photo.jpg",
    size: 1,
  });
  const result = deleteProfileData(current, "only-profile");
  assert.equal(result.document.users.length, 0);
  assert.equal(result.document.categories.length, 18);
  for (const key of BACKUP_COLLECTION_KEYS)
    if (key !== "categories") assert.deepEqual(result.document[key], []);
  assert.deepEqual(result.document._local.attachments, []);
  assert.deepEqual(result.attachmentPaths, ["photo.jpg"]);
});

test("deleting a missing profile does not change the document", () => {
  const current = documentWithTwoProfiles();
  assert.throws(() => deleteProfileData(current, "missing-profile"));
  assert.equal(current.users.length, 2);
});

test("manage screen keeps the delete sheet mounted and opens it from the profile delete action", () => {
  const app = mountManageProfilesScreen();
  let sheet = app.nodes().find((node) => node.type === "ProfileDeleteSheet");
  assert.ok(sheet);
  assert.equal(sheet.props.isOpen, false);
  assert.equal(sheet.props.profile, null);

  const list = app.nodes().find((node) => node.type === "ProfileList");
  list.props.onDelete(app.profiles[0]);
  app.render();
  sheet = app.nodes().find((node) => node.type === "ProfileDeleteSheet");
  assert.equal(sheet.props.isOpen, true);
  assert.equal(sheet.props.profile.id, "profile-one");

  sheet.props.onDismiss();
  app.render();
  sheet = app.nodes().find((node) => node.type === "ProfileDeleteSheet");
  assert.equal(sheet.props.isOpen, false);
});

test("deleting a non-active profile preserves metadata selection despite a stale selected flag", () => {
  const current = documentWithTwoProfiles();
  current._local.selectedProfileId = "kept-profile";
  current.users[0].isSelected = true;
  current.users[1].isSelected = false;
  const next = deleteProfileData(current, "target-profile").document;
  assert.equal(next._local.selectedProfileId, "kept-profile");
  assert.equal(next.users[0].uuid, "kept-profile");
  assert.equal(next.users[0].isSelected, true);
});

test("repository deletion is atomic and an explicit last-profile delete safely resets the identity guard", async () => {
  const database = databaseAdapter();
  try {
    await migrateLocalDatabase(database);
    await writeDocument(database, documentWithTwoProfiles());
    const before = await readDocument(database);
    database.fault = (statement) =>
      statement.startsWith("UPDATE app_storage_identity");
    await assert.rejects(
      mutateDocument(
        database,
        (current) => deleteProfileData(current, "target-profile").document,
      ),
      /injected failure/,
    );
    assert.deepEqual(await readDocument(database), before);

    database.fault = null;
    await mutateDocument(
      database,
      (current) => deleteProfileData(current, "target-profile").document,
    );
    const survivor = await readDocument(database);
    assert.deepEqual(
      survivor.users.map((user) => user.uuid),
      ["kept-profile"],
    );

    const reset = deleteProfileData(survivor, "kept-profile").document;
    await writeDocument(database, reset);
    await migrateLocalDatabase(database, true);
    assert.equal(getSetupStatus(await readDocument(database)), "setup");
    assert.equal(
      database.sql
        .prepare("SELECT had_profile FROM app_storage_identity WHERE id = 1")
        .get().had_profile,
      0,
    );
  } finally {
    database.sql.close();
  }
});
