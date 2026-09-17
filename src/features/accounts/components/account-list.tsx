import { Card, Chip } from "heroui-native";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { useCurrencyFormat } from "@/shared/lib/use-currency-format";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

import type { Account } from "../types";
import { AccountIcon } from "./account-icon";

type AccountListProps = {
  accounts: Account[];
  onAccountPress: (account: Account) => void;
};

export function AccountList({ accounts, onAccountPress }: AccountListProps) {
  const { formatCurrency } = useCurrencyFormat();
  const { t } = useTranslation();
  const kindLabels: Record<Account["kind"], string> = {
    bank: t("accounts.common.kinds.bank"),
    checking: t("accounts.common.kinds.checking"),
    savings: t("accounts.common.kinds.savings"),
    cash: t("accounts.common.kinds.cash"),
    credit: t("accounts.common.kinds.credit"),
  };

  return (
    <Card className="border border-border bg-surface p-0">
      <Card.Header className="px-5 pb-2 pt-5">
        <Card.Title className="font-manrope-bold text-lg text-foreground">
          {t("accounts.list.yourAccounts")}
        </Card.Title>
        <Card.Description className="mt-1 font-sans text-muted">
          {t("accounts.list.savedOnDevice")}
        </Card.Description>
      </Card.Header>

      <Card.Body className="px-5 pb-3">
        {accounts.map((account, index) => {
          return (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              className={`flex-row items-center py-4 ${
                index < accounts.length - 1 ? "border-b border-border" : ""
              }`}
              onPress={() => onAccountPress(account)}
            >
              <View
                className="size-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: account.iconBackground }}
              >
                <AccountIcon
                  color={account.color}
                  name={account.icon}
                  pathData={account.iconPath}
                  size={22}
                />
              </View>

              <View className="ml-3 flex-1">
                <Text className="font-manrope-bold text-sm text-foreground">
                  {account.name}
                </Text>
                <Text className="mt-0.5 font-sans text-xs text-muted">
                  {account.cardCompany || account.currencyCode}
                  {account.lastFour ? ` · •••• ${account.lastFour}` : ""}
                </Text>
                {(account.isDefault || account.isExcluded) && (
                  <Text className="mt-1 font-sans text-xs text-muted">
                    {[
                      account.isDefault
                        ? t("accounts.common.badges.default")
                        : "",
                      account.isExcluded
                        ? t("accounts.common.badges.excludedFromTotals")
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
              </View>

              <View className="ml-2 items-end gap-1.5">
                <Text
                  className={`font-manrope-bold text-sm ${
                    account.balance < 0 ? "text-[#ef8175]" : "text-foreground"
                  }`}
                >
                  {account.balance < 0 ? "-" : ""}
                  {formatCurrency(account.balance, account.currencyCode)}
                </Text>
                <View className="flex-row items-center gap-1">
                  <Chip color="default" size="sm" variant="tertiary">
                    <Chip.Label className="font-manrope-semibold capitalize">
                      {kindLabels[account.kind]}
                    </Chip.Label>
                  </Chip>
                  <FilledIcon name="chevron-right" size={18} tone="muted" />
                </View>
              </View>
            </Pressable>
          );
        })}
        {!accounts.length && (
          <Text className="py-6 font-sans text-sm text-muted">
            {t("accounts.common.empty")}
          </Text>
        )}
      </Card.Body>
    </Card>
  );
}
