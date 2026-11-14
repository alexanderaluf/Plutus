import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { getDocumentWindowState } from "@/data/database/month-index";
import { useLocalData } from "@/data/local-data-provider";
import {
  selectBudgetOptions,
  selectBudgets,
} from "@/data/selectors/budget-selectors";
import { selectCategories } from "@/data/selectors/category-selectors";
import {
  selectAccounts,
  selectBankAccounts,
} from "@/data/selectors/document-selectors";
import { selectSearchContext } from "@/data/selectors/search-selectors";
import {
  createTransactionIndex,
  selectTransactionMonths,
  selectTransactionProjector,
} from "@/data/selectors/transaction-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { rankRootCategories } from "@/features/transactions/transaction-form-helpers";

import type { TabId } from "./types";

type Cancel = () => void;

function whenIdle(task: () => void): Cancel {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(task, { timeout: 1500 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 50);
  return () => clearTimeout(handle);
}

/**
 * Builds the shared per-document projections in idle time after each commit,
 * so tab transitions read warm caches on Frame 1. One short task runs per idle
 * slice to avoid starving JS frame delivery on slow devices.
 */
export function ProjectionPrewarm({ activeTab }: { activeTab: TabId }) {
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const currency = activeProfile.currencyCode;

  useEffect(() => {
    const windowState = getDocumentWindowState(document);
    const tasks: (() => void)[] = [
      () => createTransactionIndex(document),
      () => selectTransactionMonths(document),
      () => selectTransactionProjector(document, language),
      () => selectAccounts(document),
      () => selectCategories(document),
      () => selectBudgets(document, new Date(), { homeOnly: true }),
      () => selectBudgetOptions(document),
      () => selectBankAccounts(document),
      () => rankRootCategories(document, selectCategories(document), 0),
      () => {
        // Warm lazy module factories while idle so the first FAB/+ or
        // Create Account tap starts its screen transition with zero cold require lag.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/features/transactions/transaction-editor-screen");
      },
      () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/features/accounts/account-create-screen");
      },
    ];
    if (!windowState?.isPartial || activeTab === "search") {
      tasks.push(() => selectSearchContext(document, currency, language));
    }
    let cancel: Cancel = () => undefined;
    const next = () => {
      const task = tasks.shift();
      if (!task) return;
      cancel = whenIdle(() => {
        try {
          task();
        } catch {
          // A failing projection is reported by the screen that needs it.
          return;
        }
        next();
      });
    };
    next();
    return () => cancel();
  }, [document, currency, language, activeTab]);

  return null;
}
