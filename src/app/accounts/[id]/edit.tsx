import {
  EdgeToEdgeLayout,
  EdgeToEdgeScrollView,
} from "@/shared/ui/edge-to-edge-layout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { useLocalData } from "@/data/local-data-provider";
import { selectAccounts } from "@/data/selectors/document-selectors";
import { AccountCreateScreen } from "@/features/accounts/account-create-screen";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";

export default function EditAccountRoute() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { document } = useLocalData();
  const router = useRouter();
  const theme = useAppThemeColors();
  if (!selectAccounts(document).some((account) => account.id === id))
    return (
      <EdgeToEdgeLayout>
        <EdgeToEdgeScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24 }}
        >
          <Text className="text-foreground">
            {t("accounts.common.accountNotFound")}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="py-6"
            onPress={() => router.dismissTo("/accounts")}
          >
            <Text className="text-accent">
              {t("accounts.common.backToAccounts")}
            </Text>
          </Pressable>
        </EdgeToEdgeScrollView>
      </EdgeToEdgeLayout>
    );
  return <AccountCreateScreen key={id} editId={id} />;
}
