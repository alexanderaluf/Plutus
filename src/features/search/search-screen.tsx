import { useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocalData } from "@/data/local-data-provider";
import { selectSearchResults } from "@/data/selectors/document-selectors";
import { PageHeader } from "@/shared/ui/page-header";
import { TabPage } from "@/shared/ui/tab-page";

import { RecentSearches } from "./components/recent-searches";
import { SearchResults } from "./components/search-results";
import { TransactionSearchField } from "./components/transaction-search-field";
import { recentQueryKeys } from "./data/search-data";
import { filterTransactions } from "./lib/filter-transactions";

export function SearchScreen() {
  const { t } = useTranslation();
  const { document } = useLocalData();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchableTransactions = selectSearchResults(document);
  const results = filterTransactions(searchableTransactions, deferredQuery);
  const recentQueries = recentQueryKeys.map((key) =>
    t(`search.recent.queries.${key}`),
  );

  return (
    <TabPage
      headerHeight={112}
      header={
        <PageHeader
          description={t("search.description")}
          eyebrow={t("search.eyebrow")}
          title={t("search.title")}
        />
      }
    >
      <TransactionSearchField value={query} onChange={setQuery} />
      {!query ? (
        <RecentSearches queries={recentQueries} onSelect={setQuery} />
      ) : null}
      <SearchResults query={deferredQuery} results={results} />
    </TabPage>
  );
}
