export type NativeBootstrapPayload = {
  revision: number;
  updatedAt: string;
  coreJson: string;
  catalogJson: string;
  months: Record<string, string>;
  source: string;
};

export type NativeMonthSlicePayload = {
  revision: number;
  monthKey: string;
  payloadJson: string | null;
};

export type NativeSearchQueryOptions = {
  profileId?: string;
  type?: number;
  startMs?: number;
  endMs?: number;
  minAmount?: number;
  maxAmount?: number;
  currencyCode?: string;
  accountIds?: string[];
  categoryIds?: string[];
  queryTokens?: string[];
  hasNote?: boolean;
  hasReceipt?: boolean;
  sort?: "newest" | "oldest" | "largest" | "smallest";
  limit?: number;
  offset?: number;
};

export type NativeSearchQueryResult = {
  totalCount: number;
  rowsJson: string;
};
