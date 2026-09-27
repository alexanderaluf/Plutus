import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { useThemeColor } from "heroui-native";

import { i18n } from "@/localization/i18n";

import {
  mutateDocument,
  createDocumentReader,
  writeDocument,
} from "./database/document-repository";
import {
  processRecurring,
  reconcileRecurring,
} from "./recurring/recurring-service";
import { registerRecurringBackgroundTask } from "./recurring/recurring-background";
import { syncRecurringReminders } from "./recurring/recurring-reminders";
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
import {
  cloneBackupDocument,
  normalizeBackupDocument,
} from "./model/normalize-backup";

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
  reconcileCardPayments: () => Promise<void>;
  ensureExchangeRates: (base: string) => Promise<ExchangeRateSnapshot>;
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
  const readPersisted = useMemo(() => createDocumentReader(database), [database]);
  const [background, accent] = useThemeColor(["background", "accent"]);
  const [document, setDocument] = useState(createDefaultBackup);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydrationError, setHydrationError] = useState<Error | null>(null);
  const documentRef = useRef(document);
  const writeQueue = useRef(Promise.resolve());
  const [paymentError, setPaymentError] = useState("");
  const hydrationRef = useRef(false);
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
    }, 500);
    return () => clearTimeout(timer);
  }, [document, isHydrated]);

  useEffect(() => {
    if (!isHydrated || getSetupStatus(document) !== "ready") return;
    const run = () => {
      void reconcileRecurringPayments().catch(() =>
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
        void refresh()
          .then(run)
          .catch(() =>
            setRecurringError("Could not reload recurring payments."),
          );
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [isHydrated, document.users.length]);

  function recurringStore() {
    return {
      read: async () => {
        await writeQueue.current.catch(() => undefined);
        return readPersisted();
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

  useEffect(() => {
    void refresh().catch(error => setHydrationError(error instanceof Error ? error : new Error("Could not open local data.")));
  }, []);

  useEffect(() => {
    if (isHydrated) void reconcileCardPayments().catch(reportPaymentError);
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
        void reconcileCardPayments()
          .catch(reportPaymentError)
          .finally(scheduleMidnightSettlement);
      }, nextMidnight.getTime() - now.getTime());
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void reconcileCardPayments().catch(reportPaymentError);
    });
    scheduleMidnightSettlement();
    return () => {
      disposed = true;
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, []);

  async function refresh() {
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        const persisted = await readPersisted();
        documentRef.current = persisted;
        setDocument(persisted);
        hydrationRef.current = true;
        setIsHydrated(true);
      });
    await writeQueue.current;
  }

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
          const normalized = await mutateDocument(database, (current) =>
            settleDueCardPayments(current),
          );
          documentRef.current = normalized;
          setDocument(normalized);
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

  async function replaceDocument(nextDocument: BackupDocument) {
    const normalized = normalizeBackupDocument(nextDocument);
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        await writeDocument(database, normalized);
        documentRef.current = normalized;
        setDocument(normalized);
      });
    await writeQueue.current;
  }

  async function updateDocument(updater: DocumentUpdater) {
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        const next = await mutateDocument(database, (current) =>
          settleDueCardPayments(
            normalizeBackupDocument(updater(cloneBackupDocument(current))),
          ),
        );
        documentRef.current = next;
        setDocument(next);
      });
    await writeQueue.current;
  }

  async function upsertRecord(
    collection: BackupCollectionKey,
    record: JsonObject,
  ) {
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
  }

  async function removeRecord(
    collection: BackupCollectionKey,
    recordId: string | number,
  ) {
    const identity = String(recordId);
    await updateDocument((current) => ({
      ...current,
      [collection]: current[collection].filter(
        (item) => String(item.uuid ?? item.id ?? "") !== identity,
      ),
    }));
  }

  if (hydrationError) throw hydrationError;
  if (!isHydrated) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: background,
          flex: 1,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={accent} size="large" />
      </View>
    );
  }

  return (
    <LocalDataContext.Provider
      value={{
        document,
        isHydrated,
        paymentError,
        recurringError: recurringError || reminderError,
        recurringBackgroundAvailable,
        reconcileRecurringPayments,
        processRecurringPayment,
        reconcileCardPayments: retryCardPayments,
        ensureExchangeRates,
        refresh,
        replaceDocument,
        updateDocument,
        upsertRecord,
        removeRecord,
      }}
    >
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
