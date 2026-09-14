import { useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Animated, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalData } from "@/data/local-data-provider";
import { selectHomeOverview } from "@/data/selectors/document-selectors";
import { BudgetHeader } from "@/features/budgets/components/budget-ui";
import { useCategoryClock } from "@/features/categories/use-category-clock";
import { useProfiles } from "@/features/profile/profile-provider";
import {
  CollapsingHeader,
  CollapsingHeaderSpacer,
  useCollapsingHeader,
} from "@/shared/ui/collapsing-header";
import {
  OverviewCard,
  OverviewPrivacyButton,
  useOverviewCards,
} from "./components/overview-card";

export function InsightsScreen() {
  const { t } = useTranslation();
  const { hidden } = useLocalSearchParams<{ hidden?: string }>();
  const [visible, setVisible] = useState(hidden !== "1");
  const { document } = useLocalData();
  const { activeProfile } = useProfiles();
  const insets = useSafeAreaInsets();
  const now = useCategoryClock(document);
  const overview = useMemo(
    () => selectHomeOverview(document, activeProfile.currencyCode, now),
    [document, activeProfile.currencyCode, now],
  );
  const cards = useOverviewCards(overview, now, visible);
  const { headerHidden, onScroll, scrollY } = useCollapsingHeader();
  return (
    <SafeAreaView className="flex-1 bg-background">
      <Animated.ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 64,
          gap: 16,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <CollapsingHeaderSpacer />
        {cards.map((card) => (
          <View key={card.id}>
            <OverviewCard card={card} visible={visible} />
          </View>
        ))}
      </Animated.ScrollView>
      <CollapsingHeader
        horizontalInset={20}
        headerHidden={headerHidden}
        scrollY={scrollY}
        topInset={insets.top}
      >
        <BudgetHeader title={t("home.overview.allInsights")} horizontalPadding={0}>
          <OverviewPrivacyButton
            visible={visible}
            onPress={() => setVisible((value) => !value)}
          />
        </BudgetHeader>
      </CollapsingHeader>
    </SafeAreaView>
  );
}
