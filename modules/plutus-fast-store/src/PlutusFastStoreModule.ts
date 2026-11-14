import type { NativeModule } from "expo";

import type {
  NativeBootstrapPayload,
  NativeMonthSlicePayload,
  NativeSearchQueryOptions,
  NativeSearchQueryResult,
} from "./PlutusFastStore.types";

declare class PlutusFastStoreNativeModule extends NativeModule {
  readBootstrapSync(
    dbPath: string | null,
    dbName: string,
    activeMonthKeys: string[],
  ): NativeBootstrapPayload | null;
  readMonthSliceSync(
    dbPath: string | null,
    dbName: string,
    monthKey: string,
  ): NativeMonthSlicePayload | null;
  queryRangeSync(
    dbPath: string | null,
    dbName: string,
    startMs: number,
    endMs: number,
    profileId: string | null,
    limit: number,
  ): string;
  searchTransactionsSync(
    dbPath: string | null,
    dbName: string,
    options: NativeSearchQueryOptions,
  ): NativeSearchQueryResult;
  evictColdMonthsSync(keepMonthKeys: string[]): void;
  clearCacheSync(): void;
  syncPartitionFilesAsync(
    dbPath: string | null,
    dbName: string,
    dirtyMonthKeys: string[] | null,
    forceAll: boolean,
  ): Promise<number>;
}

function resolveNativeModule(): PlutusFastStoreNativeModule | null {
  try {
    // Dynamically resolve expo so pure Node test scripts without Expo runtime never crash.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo") as {
      requireOptionalNativeModule?: <T>(name: string) => T | null;
    };
    return requireOptionalNativeModule?.<PlutusFastStoreNativeModule>("PlutusFastStore") ?? null;
  } catch {
    return null;
  }
}

export default resolveNativeModule();
