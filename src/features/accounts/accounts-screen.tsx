import { useLocalData } from "@/data/local-data-provider";
import {
  selectAccountTotalsByCurrency,
  selectAccounts,
} from "@/data/selectors/document-selectors";
import { useProfiles } from "@/features/profile/profile-provider";
import { useLocalDayClock } from "@/shared/lib/use-local-day-clock";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Animated as NativeAnimated, Pressable, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/shared/ui/app-text";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import { FilledIcon } from "@/shared/ui/filled-icon";
import { TAB_HEADER_HEIGHT, TabHeader } from "@/shared/navigation/tab-header";
import { AccountGroupCard } from "./components/account-list-card";
import { AccountsOverview } from "./components/accounts-overview";
import type { Account } from "./types";

type AccountGroup = "everyday" | "cards" | "savings";
type Section = { key: AccountGroup; accounts: Account[] };

const GROUP_ORDER: AccountGroup[] = ["everyday", "cards", "savings"];

function groupOf(account: Account): AccountGroup {
  if (account.kind === "credit") return "cards";
  if (account.kind === "savings") return "savings";
  return "everyday";
}

function reveal(_index: number) {
  return undefined;
}

export function AccountsScreen() {
  const { t } = useTranslation();
  const { document, paymentError, reconcileCardPayments } = useLocalData();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useLocalDayClock();
  const accounts = selectAccounts(document, now);
  const { activeProfile } = useProfiles();
  const included = accounts.filter((account) => !account.isExcluded);
  // The profile currency leads; other currencies are listed, never converted.
  const totals = selectAccountTotalsByCurrency(included).sort(
    (a, b) =>
      Number(b.currencyCode === activeProfile.currencyCode) -
      Number(a.currencyCode === activeProfile.currencyCode),
  );
  const sections: Section[] = GROUP_ORDER.map((group) => ({
    key: group,
    accounts: accounts.filter((account) => groupOf(account) === group),
  })).filter((section) => section.accounts.length > 0);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();

  return (
    <View style={{ flex: 1 }}>
      <NativeAnimated.FlatList
        data={sections}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 112 + insets.bottom,
          gap: 22,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <CollapsingHeaderSpacer height={TAB_HEADER_HEIGHT} />
            <View className="h-1" />
            {!!paymentError && (
              <Animated.View
                entering={reveal(1)}
                className="mb-3 flex-row items-center gap-3 rounded-[24px] border border-border bg-surface p-4"
                style={{ borderCurve: "continuous" }}
              >
                <View
                  className="size-10 shrink-0 items-center justify-center rounded-2xl bg-surface-secondary"
                  style={{ borderCurve: "continuous" }}
                >
                  <FilledIcon name="help" size={18} tone="danger" />
                </View>
                <View className="min-w-0 flex-1 gap-2">
                  <Text
                    accessibilityRole="alert"
                    className="font-sans text-[13px] leading-[18px] text-danger"
                  >
                    {paymentError}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      void reconcileCardPayments();
                    }}
                    className="min-h-9 self-start rounded-full border border-border bg-surface-secondary px-3.5 py-1.5"
                    style={({ pressed }) => ({ opacity: pressed ? 0.68 : 1 })}
                  >
                    <Text className="font-manrope-semibold text-[12px] leading-[16px] text-accent">
                      {t("accounts.list.retryCardPayments")}
                    </Text>
                  </Pressable>
                </View>
              </Animated.View>
            )}
            {accounts.length > 0 && (
              <Animated.View entering={reveal(0)}>
                <AccountsOverview
                  totals={totals}
                  excludedCount={accounts.length - included.length}
                />
              </Animated.View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={reveal(index + (paymentError ? 2 : 1))}
            className="gap-2.5"
          >
            <View className="flex-row items-center justify-between gap-3 px-0.5">
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                className="min-w-0 flex-1 font-manrope-bold text-[19px] leading-[24px] tracking-[-0.2px] text-foreground"
              >
                {t(`accounts.list.groups.${item.key}`)}
              </Text>
              <View className="shrink-0 rounded-full border border-border/70 bg-surface px-2.5 py-0.5">
                <Text
                  className="font-manrope-semibold text-[11px] leading-[15px] text-muted"
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {t("accounts.list.count", { count: item.accounts.length })}
                </Text>
              </View>
            </View>
            <AccountGroupCard
              accounts={item.accounts}
              onAccountPress={(account) =>
                router.push({
                  pathname: "/accounts/[id]",
                  params: { id: account.id },
                })
              }
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <Animated.View entering={reveal(1)}>
            <View
              className="items-center gap-3 rounded-[24px] border border-border bg-surface px-6 py-8"
              style={{ borderCurve: "continuous" }}
            >
              <View
                className="size-12 items-center justify-center rounded-2xl bg-surface-secondary"
                style={{ borderCurve: "continuous" }}
              >
                <FilledIcon name="wallet" size={22} tone="accent" />
              </View>
              <Text className="text-center font-sans text-[14px] leading-[20px] text-muted">
                {t("accounts.common.empty")}
              </Text>
            </View>
          </Animated.View>
        }
      />
      <CollapsingHeader
        height={TAB_HEADER_HEIGHT}
        horizontalInset={20}
        headerHidden={headerHidden}
        scrollY={scrollY}
      >
        <TabHeader />
      </CollapsingHeader>
    </View>
  );
}
