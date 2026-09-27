import { useEffect, useMemo, useState } from "react";
import type { BackupDocument } from "@/data/model/backup-document";
import { createHomeDataLoader } from "@/data/selectors/home-data-loader";
import type { HomeSection } from "@/data/selectors/home-section-selectors";

function useProjection<T>(
  request: { load: (signal: AbortSignal) => Promise<T>; scope?: object } | null,
  keepPrevious = false,
) {
  const [result, setResult] = useState<{
    request: typeof request;
    data?: T;
    error?: Error;
  } | null>(null);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    void request.load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ request, data });
      },
      (reason: unknown) => {
        if (!controller.signal.aborted)
          setResult((current) => ({
            request,
            ...(keepPrevious && current?.request?.scope === request.scope
              ? { data: current?.data }
              : {}),
            error:
              reason instanceof Error
                ? reason
                : new Error("Could not prepare home data."),
          }));
      },
    );
    return () => controller.abort();
  }, [request, keepPrevious]);
  if (result?.request === request) return result;
  // A clock refresh may reuse this document/currency's overview while updating
  // it. Never retain another document/profile/section's rows.
  return keepPrevious &&
    result?.data !== undefined &&
    result.request?.scope === request?.scope
    ? result
    : null;
}

export function useHomeData(
  document: BackupDocument,
  currency: string,
  now: Date,
  section: HomeSection,
  retry: number,
) {
  // Retrying discards a failed projection/cache without changing stored data.
  const loader = useMemo(
    () => ({ generation: retry, ...createHomeDataLoader(document) }),
    [document, retry],
  );
  const indexRequest = useMemo(
    () => ({ load: (signal: AbortSignal) => loader.loadIndex(signal) }),
    [loader],
  );
  const index = useProjection(indexRequest);
  const overviewScope = useMemo(
    () => ({ loader, currency }),
    [loader, currency],
  );
  const overviewRequest = useMemo(
    () => ({
      scope: overviewScope,
      load: (signal: AbortSignal) => loader.loadOverview(currency, now, signal),
    }),
    [loader, currency, now, overviewScope],
  );
  const overview = useProjection(overviewRequest, true);
  const indexReady = !!index?.data;
  const sectionRequest = useMemo(
    () =>
      section === "transactions" || !indexReady
        ? null
        : {
            load: (signal: AbortSignal) =>
              loader.loadSection(section, now, signal),
          },
    [loader, now, section, indexReady],
  );
  const data = useProjection(sectionRequest);
  return {
    index: index?.data,
    overview: overview?.data,
    overviewRefreshing:
      !!overview?.data && overview.request !== overviewRequest,
    sectionData: data?.data,
    pending: section === "transactions" ? !index : !data,
    error: index?.error ?? data?.error ?? overview?.error,
  };
}
