import type { AccountDraft, AccountType } from "@/data/model/account-record";
import type { BackupDocument } from "@/data/model/backup-document";
import { createDefaultSavingsDetails } from "@/data/model/savings-account";
import {
  selectAccounts,
  selectBankAccounts,
} from "@/data/selectors/document-selectors";
import { ICON_COLORS } from "@/shared/icons/colors";

export const defaultIcons = {
  card: "credit-card",
  cash: "cash",
  savings: "piggy-bank",
  bank: "bank",
} as const satisfies Record<AccountType, string>;

/**
 * A new account starts from what the profile already holds: its currency,
 * default status when it is the first account, a colour no other account
 * uses, and the only bank account as the payer of a new card.
 */
export function createInitialAccountDraft(
  document: BackupDocument,
  currencyCode: string,
): AccountDraft {
  const owned = selectAccounts(document);
  const banks = selectBankAccounts(document);
  // A card needs a paying bank account, so a profile without one starts there.
  const accountType: AccountType = banks.length ? "card" : "bank";
  const usedColors = new Set(
    owned.map((account) => account.color.toLowerCase()),
  );
  return {
    name: "",
    amount: "",
    creditLimit: "",
    accountNumber: "",
    accountType,
    currencyCode: currencyCode.toUpperCase(),
    icon: defaultIcons[accountType],
    iconPath: null,
    color:
      ICON_COLORS.find((swatch) => !usedColors.has(swatch)) ?? ICON_COLORS[0],
    isDefault: owned.length === 0,
    isExcluded: false,
    cardLastFour: "",
    cardCompany: "",
    paymentDay: null,
    bankName: "",
    linkedBankAccountId: banks.length === 1 ? banks[0].id : null,
    savingsDetails: createDefaultSavingsDetails(),
  };
}
