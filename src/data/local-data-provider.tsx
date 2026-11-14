import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, View } from "react-native";
import { useThemeColor } from "heroui-native";

import { i18n } from "@/localization/i18n";

import {
  createDocumentReader,
  createWindowedDocumentReader,
  mutateDocument,
  projectUiDocumentAfterCommit,
  writeDocument,
} from "./database/document-repository";
import {
  ensurePeriodMonthsLoadedAsync,
  ensurePeriodMonthsLoadedSync,
  readNativeWindowBootstrapSync,
} from "./database/fast-store-client";
import { getDocumentWindowState } from "./database/month-index";
import {
  processRecurring,
  reconcileRecurring,
  processDueRecurrings,
  type ProcessDueResult,
} from "./recurring/recurring-service";
import { registerRecurringBackgroundTask } from "./recurring/recurring-background";
import { syncRecurringReminders } from "./recurring/recurring-reminders";
import { syncDailyNotifications } from "./notifications/daily-notifications";
import { syncHomeWidget } from "./widgets/widget-sync";
import type {
  BackupCollectionKey,
  BackupDocument,
} from "./model/backup-document";
import { createDefaultBackup } from "./model/default-backup";
import { getSetupStatus } from "./model/onboarding";
import {
  selectDueCardPayments,
  cardPaymentConversion,
  settleDueCardPayments,
} from "./model/card-payment";
import { getExchangeRates } from "./exchange-rates/exchange-rate-service";
import {
  storeExchangeRates,
  type ExchangeRateSnapshot,
} from "./model/exchange-rate";
import { selectExchangeRates } from "./selectors/exchange-rate-selectors";
import type { JsonObject } from "./model/json";
import { normalizeBackupDocument } from "./model/normalize-backup";

type DocumentUpdater = (current: BackupDocument) => BackupDocument;

type LocalDataContextValue = {
  document: BackupDocument;
  isHydrated: boolean;
  paymentError: string;
  recurringError: string;
  recurringBackgroundAvailable: boolean;
  reconcileRecurringPayments: () => Promise<void>;
  processRecurringPayment: (
    id: string,
    key: string,
    profileId: string,
  ) => Promise<void>;
  /** Records every due occurrence for the profile after user confirmation. */
  processDueRecurringPayments: (profileId: string) => Promise<ProcessDueResult>;
  reconcileCardPayments: () => Promise<void>;
  ensureExchangeRates: (base: string) => Promise<ExchangeRateSnapshot>;
  ensurePeriodLoaded: (start: Date, end: Date) => Promise<void>;
  loadFullDocument: () => Promise<BackupDocument>;
  refresh: () => Promise<void>;
  replaceDocument: (document: BackupDocument) => Promise<void>;
  updateDocument: (updater: DocumentUpdater) => Promise<void>;
  upsertRecord: (
    collection: BackupCollectionKey,
    record: JsonObject,
  ) => Promise<void>;
  removeRecord: (
    collection: BackupCollectionKey,
    recordId: string | number,
  ) => Promise<void>;
};

const LocalDataContext = createContext<LocalDataContextValue | null>(null);

export function LocalDataProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const readWindowed = useMemo(
    () => createWindowedDocumentReader(database),
    [database],
  );
  const readCanonicalFull = useMemo(
    () => createDocumentReader(database),
    [database],
  );
  const [background] = useThemeColor(["background"]);
  const [initialSnapshot] = useState(() =>
    readNativeWindowBootstrapSync(database),
  );
  const [document, setDocument] = useState<BackupDocument>(
    () => initialSnapshot ?? createDefaultBackup(),
  );
  const [isHydrated, setIsHydrated] = useState(
    () => initialSnapshot !== null,
  );
  const [hydrationError, setHydrationError] = useState<Error | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  const writeQueue = useRef(Promise.resolve());
  const [paymentError, setPaymentError] = useState("");
  const hydrationRef = useRef(initialSnapshot !== null);
  const settlementWork = useRef<Promise<void> | null>(null);
  const rateRequests = useRef(new Map<string, Promise<ExchangeRateSnapshot>>());
  const lastRateAttempt = useRef(new Map<string, number>());
  const [recurringError, setRecurringError] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [recurringBackgroundAvailable, setRecurringBackgroundAvailable] =
    useState(false);
  const recurringWork = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!isHydrated || getSetupStatus(document) !== "ready") return;
    const timer = setTimeout(() => {
      void syncRecurringReminders(document)
        .then(() => setReminderError(""))
        .catch((reason) =>
          setReminderError(
            reason instanceof Error
              ? reason.message
              : "Reminders could not be scheduled.",
          ),
        );
      // Summaries are rebuilt from the latest records; failures are retried
      // on the next change and never block the recurring reminders.
      void syncDailyNotifications(document).catch(() => undefined);
      void syncHomeWidget(document).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [document, isHydrated]);

  // Effect events always see the latest records, so the effects below keep
  // their deliberate schedules instead of restarting on every document change.
  const reconcileRecurringNow = useEffectEvent(() =>
    reconcileRecurringPayments(),
  );
  const refreshNow = useEffectEvent(() => refresh());
  const reconcileCardsNow = useEffectEvent(() => reconcileCardPayments());
  const isReady = isHydrated && getSetupStatus(document) === "ready";

  useEffect(() => {
    if (!isReady) return;
    const run = () => {
      void reconcileRecurringNow().catch(() =>
        setRecurringError(
          "Recurring payments could not be checked. Please try again.",
        ),
      );
    };
    run();
    void registerRecurringBackgroundTask()
      .then(setRecurringBackgroundAvailable)
      .catch(() => setRecurringBackgroundAvailable(false));
    const timer = setInterval(run, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void refreshNow()
          .then(run)
          .catch(() =>
            setRecurringError("Could not reload recurring payments."),
          );
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
    // A new profile restarts the schedule, as do hydration and finished setup.
  }, [isReady, document.users.length]);

  function recurringStore() {
    return {
      read: async () => {
        await writeQueue.current.catch(() => undefined);
        return readCanonicalFull();
      },
      update: updateDocument,
    };
  }
  async function reconcileRecurringPayments() {
    if (!hydrationRef.current || getSetupStatus(documentRef.current) !== "ready") return;
    if (recurringWork.current) return recurringWork.current;
    recurringWork.current = reconcileRecurring(recurringStore())
      .then((result) => {
        setRecurringError(
          result.error ||
            (result.remaining
              ? "More overdue payments remain. They will continue on the next check."
              : ""),
        );
      })
      .catch((reason) => {
        setRecurringError(
          reason instanceof Error
            ? reason.message
            : "Recurring payments could not be checked.",
        );
        throw reason;
      })
      .finally(() => {
        recurringWork.current = null;
      });
    await recurringWork.current;
  }
  async function processRecurringPayment(
    id: string,
    key: string,
    profileId: string,
  ) {
    await processRecurring(recurringStore(), id, key, { profileId });
    setRecurringError("");
  }
  async function processDueRecurringPayments(profileId: string) {
    // Let an automatic check finish first so both never chase the same key.
    await recurringWork.current?.catch(() => undefined);
    const result = await processDueRecurrings(recurringStore(), profileId);
    if (!result.error) setRecurringError("");
    return result;
  }

  useEffect(() => {
    if (initialSnapshot !== null) return;
    void refreshNow().catch(error => setHydrationError(error instanceof Error ? error : new Error("Could not open local data.")));
  }, [initialSnapshot]);

  useEffect(() => {
    if (!isHydrated) return;
    if (selectDueCardPayments(document).length === 0) return;
    void reconcileCardsNow().catch(reportPaymentError);
    // Every saved change can settle a card payment when an unsettled due balance exists.
  }, [isHydrated, document]);

  function reportPaymentError() {
    setPaymentError(i18n.t("errors.cardPayments.save"));
  }

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const scheduleMidnightSettlement = () => {
      if (disposed) return;
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1,
      );
      midnightTimer = setTimeout(() => {
        void reconcileCardsNow()
          .catch(reportPaymentError)
          .finally(scheduleMidnightSettlement);
      }, nextMidnight.getTime() - now.getTime());
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void reconcileCardsNow().catch(reportPaymentError);
    });
    scheduleMidnightSettlement();
    return () => {
      disposed = true;
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);

  const refresh = useCallback(async () => {
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        const persisted = await readWindowed();
        // Unchanged storage returns the same object; keeping it avoids
        // invalidating every screen's projections on each app foreground.
        if (persisted !== documentRef.current) {
          documentRef.current = persisted;
          setDocument(persisted);
        }
        hydrationRef.current = true;
        setIsHydrated(true);
      });
    await writeQueue.current;
  }, [readWindowed]);

  const loadFullDocument = useCallback(async () => {
    await writeQueue.current.catch(() => undefined);
    return readCanonicalFull();
  }, [readCanonicalFull]);

  const ensurePeriodLoaded = useCallback(async (start: Date, end: Date) => {
    const current = documentRef.current;
    if (!getDocumentWindowState(current)) return;

    const syncNext = ensurePeriodMonthsLoadedSync(current, start, end);
    if (syncNext !== current) {
      documentRef.current = syncNext;
      setDocument(syncNext);
      return;
    }

    const asyncNext = await ensurePeriodMonthsLoadedAsync(current, start, end);
    if (asyncNext === current) return;

    const latest = documentRef.current;
    const merged =
      latest === current
        ? asyncNext
        : await ensurePeriodMonthsLoadedAsync(latest, start, end);
    if (merged !== latest) {
      documentRef.current = merged;
      setDocument(merged);
    }
  }, []);

  async function reconcileCardPayments() {
    if (!hydrationRef.current || getSetupStatus(documentRef.current) !== "ready") return;
    if (settlementWork.current) return settlementWork.current;
    const work = async () => {
      const now = new Date();
      const bases = new Set(
        selectDueCardPayments(documentRef.current, now)
          .filter(
            ({ card, bank }) =>
              Number(card.amount) < 0 &&
              card.currencyCode !== bank.currencyCode &&
              cardPaymentConversion(documentRef.current, card, bank, now).bankAmount === null,
          )
          .map(({ card }) => String(card.currencyCode)),
      );
      await Promise.all(
        [...bases].map(async (base) => {
          // Avoid repeated failed downloads on every local write while offline.
          if (Date.now() - (lastRateAttempt.current.get(base) ?? 0) < 60_000)
            return;
          lastRateAttempt.current.set(base, Date.now());
          try {
            await ensureExchangeRates(base);
          } catch {
            /* Leave payment pending. */
          }
        }),
      );
      writeQueue.current = writeQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (
            settleDueCardPayments(documentRef.current) === documentRef.current
          )
            return;
          const committed = await mutateDocument(database, (current) =>
            settleDueCardPayments(current),
          );
          const projected = projectUiDocumentAfterCommit(
            database,
            committed,
            documentRef.current,
          );
          documentRef.current = projected;
          setDocument(projected);
        });
      await writeQueue.current;
      const pending = selectDueCardPayments(documentRef.current).some(
        ({ card }) => Number(card.amount) < 0,
      );
      setPaymentError(
        pending ? i18n.t("errors.cardPayments.rateUnavailable") : "",
      );
    };
    settlementWork.current = work().finally(() => {
      settlementWork.current = null;
    });
    await settlementWork.current;
  }

  async function retryCardPayments() {
    lastRateAttempt.current.clear();
    try {
      await reconcileCardPayments();
    } catch {
      reportPaymentError();
    }
  }

  async function ensureExchangeRates(base: string) {
    const code = base.toUpperCase();
    const cached = selectExchangeRates(documentRef.current, code);
    const today = new Date().toISOString().slice(0, 10);
    if (cached && cached.date === today) return cached;
    const pending = rateRequests.current.get(code);
    if (pending) return pending;
    const request = getExchangeRates(code)
      .then(async (snapshot) => {
        await updateDocument((current) =>
          storeExchangeRates(current, snapshot),
        );
        return snapshot;
      })
      .finally(() => rateRequests.current.delete(code));
    rateRequests.current.set(code, request);
    return request;
  }

  const replaceDocument = useCallback(
    async (nextDocument: BackupDocument) => {
      const normalized = normalizeBackupDocument(nextDocument);
      writeQueue.current = writeQueue.current
        .catch(() => undefined)
        .then(async () => {
          const committed = await writeDocument(database, normalized);
          const projected = projectUiDocumentAfterCommit(
            database,
            committed,
            documentRef.current,
          );
          documentRef.current = projected;
          setDocument(projected);
        });
      await writeQueue.current;
    },
    [database],
  );

  const updateDocument = useCallback(
    async (updater: DocumentUpdater) => {
      writeQueue.current = writeQueue.current
        .catch(() => undefined)
        .then(async () => {
          // `current` is the committed clone inside the write lock, and
          // mutateDocument runs normalizeBackupDocument once after the updater.
          const committed = await mutateDocument(database, (current) =>
            settleDueCardPayments(updater(current)),
          );
          const projected = projectUiDocumentAfterCommit(
            database,
            committed,
            documentRef.current,
          );
          documentRef.current = projected;
          setDocument(projected);
        });
      await writeQueue.current;
    },
    [database],
  );

  const upsertRecord = useCallback(
    async (collection: BackupCollectionKey, record: JsonObject) => {
      const identity = String(record.uuid ?? record.id ?? "");
      if (!identity) throw new Error("Records require an id or uuid.");

      await updateDocument((current) => {
        const records = current[collection];
        const index = records.findIndex(
          (item) => String(item.uuid ?? item.id ?? "") === identity,
        );
        const nextRecords = [...records];
        if (index >= 0) nextRecords[index] = record;
        else nextRecords.push(record);
        return { ...current, [collection]: nextRecords };
      });
    },
    [updateDocument],
  );

  const removeRecord = useCallback(
    async (collection: BackupCollectionKey, recordId: string | number) => {
      const identity = String(recordId);
      await updateDocument((current) => ({
        ...current,
        [collection]: current[collection].filter(
          (item) => String(item.uuid ?? item.id ?? "") !== identity,
        ),
      }));
    },
    [updateDocument],
  );

  const contextValue = useMemo<LocalDataContextValue>(
    () => ({
      document,
      isHydrated,
      paymentError,
      recurringError: recurringError || reminderError,
      recurringBackgroundAvailable,
      reconcileRecurringPayments,
      processRecurringPayment,
      processDueRecurringPayments,
      reconcileCardPayments: retryCardPayments,
      ensureExchangeRates,
      ensurePeriodLoaded,
      loadFullDocument,
      refresh,
      replaceDocument,
      updateDocument,
      upsertRecord,
      removeRecord,
    }),
    // Callback helpers read latest state from refs/queue cleanly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      document,
      isHydrated,
      paymentError,
      recurringError,
      reminderError,
      recurringBackgroundAvailable,
      ensurePeriodLoaded,
      loadFullDocument,
      refresh,
      replaceDocument,
      updateDocument,
      upsertRecord,
      removeRecord,
    ],
  );

  if (hydrationError) throw hydrationError;
  if (!isHydrated) {
    return <View style={{ backgroundColor: background, flex: 1 }} />;
  }

  return (
    <LocalDataContext.Provider value={contextValue}>
      {children}
    </LocalDataContext.Provider>
  );
}

export function useLocalData() {
  const context = useContext(LocalDataContext);

  if (!context) {
    throw new Error("useLocalData must be used within LocalDataProvider");
  }

  return context;
}
