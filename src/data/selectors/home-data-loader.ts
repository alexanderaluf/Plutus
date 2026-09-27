import type { BackupDocument } from "../model/backup-document";
import { financialMonth } from "../model/financial-month";
import { runProjection } from "./cooperative";
import { iterateHomeOverview, type HomeOverview } from "./document-selectors";
import {
  iterateHomeSection,
  type HomeSection,
  type HomeSectionData,
} from "./home-section-selectors";
import {
  iterateTransactionIndex,
  transactionRecordsInPeriod,
  type TransactionIndexEntry,
} from "./transaction-selectors";

/** Disposable projections of one committed document, never persisted records. */
export function createHomeDataLoader(document: BackupDocument) {
  let index: TransactionIndexEntry[] | undefined;
  const overviewCache = new Map<string, HomeOverview>();
  const sectionCache = new Map<string, HomeSectionData>();
  let sectionTime: number | undefined;

  async function loadIndex(signal: AbortSignal) {
    if (index) return index;
    const result = await runProjection(
      iterateTransactionIndex(document),
      signal,
    );
    if (!signal.aborted) index = result;
    return result;
  }
  async function loadOverview(
    currency: string,
    now: Date,
    signal: AbortSignal,
  ) {
    const key = `${currency}:${now.getTime()}`;
    const cached = overviewCache.get(key);
    if (cached) return cached;
    const { start } = financialMonth(now, document._local.monthStartDay);
    const transactions = index
      ? transactionRecordsInPeriod(index, start, new Date(now.getTime() + 1))
      : document.transactions;
    const result = await runProjection(
      iterateHomeOverview(document, currency, now, transactions),
      signal,
    );
    if (!signal.aborted) {
      overviewCache.clear();
      overviewCache.set(key, result);
    }
    return result;
  }
  async function loadSection(
    section: Exclude<HomeSection, "transactions">,
    now: Date,
    signal: AbortSignal,
  ) {
    if (sectionTime !== now.getTime()) {
      sectionTime = now.getTime();
      sectionCache.clear();
    }
    const key = `${section}:${now.getTime()}`;
    const cached = sectionCache.get(key);
    if (cached) return cached;
    const entries = section === "categories" ? await loadIndex(signal) : index;
    const result = await runProjection(
      iterateHomeSection(document, now, section, entries),
      signal,
    );
    if (!signal.aborted) sectionCache.set(key, result);
    return result;
  }
  return { loadIndex, loadOverview, loadSection };
}
