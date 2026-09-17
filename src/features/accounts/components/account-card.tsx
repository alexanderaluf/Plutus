import type { Account } from "../types";
import { BankAccountCard } from "./bank-account-card";
import { CreditAccountCard } from "./credit-account-card";
import { SavingsAccountCard } from "./savings-account-card";

export function AccountCard({
  account,
  showDetails = false,
}: {
  account: Account;
  showDetails?: boolean;
}) {
  if (account.kind === "credit")
    return <CreditAccountCard account={account} showDetails={showDetails} />;
  if (account.kind === "savings")
    return <SavingsAccountCard account={account} showDetails={showDetails} />;
  return <BankAccountCard account={account} showDetails={showDetails} />;
}
