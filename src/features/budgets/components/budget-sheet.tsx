import { useAppLocalization } from "@/localization/localization-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import { AppModal } from "@/shared/ui/app-modal";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  View,
} from "react-native";

// iOS keeps its native bottom sheet in budget-sheet.ios.tsx.
export function BudgetSheet({
  title,
  children,
  onClose,
  busy = false,
}: PropsWithChildren<{
  title: string;
  onClose: () => void;
  busy?: boolean;
}>) {
  const c = useAppThemeColors();
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  return (
    <AppModal
      visible
      presentation="sheet"
      sheetHeight="82%"
      dismissable={!busy}
      backdropLabel={t("budgets.common.dismissSheet")}
      onRequestClose={() => !busy && onClose()}
    >
        <View style={{ flex: 1, direction }}>
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: c.muted,
              opacity: 0.4,
              alignSelf: "center",
              marginTop: 10,
            }}
          />
          <Text
            accessibilityRole="header"
            className="px-5 pb-4 pt-4 font-manrope-bold text-2xl text-foreground"
          >
            {title}
          </Text>
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingBottom: 18,
              gap: 10,
            }}
          >
            {children}
          </ScrollView>
        </View>
    </AppModal>
  );
}
