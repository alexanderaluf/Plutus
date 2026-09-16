import { useAppLocalization } from "@/localization/localization-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { Text } from "@/shared/ui/app-text";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Keep the existing Android/web modal, keyboard and backdrop behavior.
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
  const c = useAppThemeColors(),
    insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => !busy && onClose()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          direction,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,.64)",
          paddingTop: insets.top + 16,
        }}
      >
        <Pressable
          accessibilityLabel={t("budgets.common.dismissSheet")}
          onPress={() => !busy && onClose()}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        />
        <View
          accessibilityViewIsModal
          style={{
            height: "82%",
            maxHeight: "100%",
            backgroundColor: c.background,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            borderWidth: 1,
            borderColor: c.border,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
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
      </KeyboardAvoidingView>
    </Modal>
  );
}
