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
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/shared/ui/app-text";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
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

const INITIAL_DELAY = 45;
const STAGGER_DELAY = 85;
const REVEAL_DURATION = 420;

function reveal(index: number) {
  return FadeInDown.duration(REVEAL_DURATION)
    .delay(INITIAL_DELAY + index * STAGGER_DELAY)
    .easing(Easing.bezier(0.22, 1, 0.36, 1))
    .reduceMotion(ReduceMotion.System);
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
          paddingHorizontal: 16,
          paddingBottom: 110 + insets.bottom,
          gap: 24,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <CollapsingHeaderSpacer height={TAB_HEADER_HEIGHT} />
            {/* With the list gap, 28pt below the header like Home. */}
            <View className="h-1" />
            {!!paymentError && (
              <Animated.View
                entering={reveal(1)}
                className="mb-3 gap-3 rounded-2xl bg-surface p-4"
              >
                <Text accessibilityRole="alert" className="text-danger">
                  {paymentError}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void reconcileCardPayments();
                  }}
                >
                  <Text className="font-manrope-bold text-accent">
                    {t("accounts.list.retryCardPayments")}
                  </Text>
                </Pressable>
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
            <View className="flex-row items-baseline justify-between px-1">
              <Text
                accessibilityRole="header"
                className="font-manrope-bold text-lg text-foreground"
              >
                {t(`accounts.list.groups.${item.key}`)}
              </Text>
              <Text
                className="font-manrope-medium text-xs text-muted"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {t("accounts.list.count", { count: item.accounts.length })}
              </Text>
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
            <Text className="px-4 py-12 text-center font-sans text-base text-muted">
              {t("accounts.common.empty")}
            </Text>
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
