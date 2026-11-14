import { useMemo } from "react";

import type { BackupDocument } from "@/data/model/backup-document";
import { financialMonth } from "@/data/model/financial-month";
import { finishProjection } from "@/data/selectors/cooperative";
import { iterateHomeOverview } from "@/data/selectors/document-selectors";
import { memoizeForDocument } from "@/data/selectors/document-memo";
import {
  iterateHomeSection,
  type HomeSection,
} from "@/data/selectors/home-section-selectors";
import {
  createTransactionIndex,
  transactionRecordsInPeriod,
} from "@/data/selectors/transaction-selectors";

type Attempt<T> = { value?: T; error?: Error };

function attempt<T>(work: () => T): Attempt<T> {
  try {
    return { value: work() };
  } catch (reason) {
    return {
      error:
        reason instanceof Error
          ? reason
          : new Error("Could not prepare home data."),
    };
  }
}

/**
 * Home projections, computed synchronously from the shared per-document index.
 *
 * Every result is cached per committed document (and clock/currency), so
 * returning to Home, switching sections or re-rendering never recomputes, and a
 * save produces the new numbers in the same render as the new document — no
 * loading state, no empty flash. The index restricts work to the visible month.
 */
export function useHomeData(
  document: BackupDocument,
  currency: string,
  now: Date,
  section: HomeSection,
  retry: number,
) {
  const nowTime = now.getTime();
  const monthStartDay = document._local.monthStartDay;
  const indexed = useMemo(
    () => attempt(() => createTransactionIndex(document)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, retry],
  );
  const index = indexed.value;
  const overview = useMemo(
    () =>
      !index
        ? ({} as Attempt<never>)
        : attempt(() =>
            memoizeForDocument(
              document,
              `home-overview:${currency}:${nowTime}`,
              () => {
                const clock = new Date(nowTime);
                const { start } = financialMonth(clock, monthStartDay);
                return finishProjection(
                  iterateHomeOverview(
                    document,
                    currency,
                    clock,
                    transactionRecordsInPeriod(
                      index,
                      start,
                      new Date(nowTime + 1),
                    ),
                  ),
                );
              },
            ),
          ),
    // A retry re-attempts a failed build; failures are never cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, currency, nowTime, monthStartDay, index, retry],
  );
  const sectionData = useMemo(
    () =>
      section === "transactions" || !index
        ? null
        : attempt(() =>
            memoizeForDocument(
              document,
              `home-section:${section}:${nowTime}`,
              () =>
                finishProjection(
                  iterateHomeSection(
                    document,
                    new Date(nowTime),
                    section,
                    index,
                  ),
                ),
            ),
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [document, nowTime, index, section, retry],
  );
  return {
    index,
    overview: overview.value,
    overviewRefreshing: false,
    sectionData: sectionData?.value,
    pending: false,
    error: indexed.error ?? overview.error ?? sectionData?.error,
  };
}
