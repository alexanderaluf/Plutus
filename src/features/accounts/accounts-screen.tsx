import { useLocalData } from "@/data/local-data-provider";
import { selectAccounts } from "@/data/selectors/document-selectors";
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
import { AccountCard } from "./components/account-card";

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
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  return (
    <View style={{ flex: 1 }}>
      <NativeAnimated.FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 110 + insets.bottom,
          gap: 14,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <CollapsingHeaderSpacer />
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
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={reveal(index + (paymentError ? 2 : 1))}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("accounts.list.viewDetails", {
                name: item.name,
              })}
              onPress={() =>
                router.push({
                  pathname: "/accounts/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <AccountCard account={item} showDetails={false} />
            </Pressable>
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
      <CollapsingHeader headerHidden={headerHidden} scrollY={scrollY}>
        <Animated.View
          entering={reveal(0)}
          className="flex-row items-center justify-between py-4"
        >
          <Text
            accessibilityRole="header"
            className="font-manrope-bold text-2xl text-foreground"
          >
            {t("accounts.list.title")}
          </Text>
          <Text className="font-sans text-sm text-muted">
            {t("accounts.list.count", { count: accounts.length })}
          </Text>
        </Animated.View>
      </CollapsingHeader>
    </View>
  );
}
