import { Button } from "heroui-native";
import { useState, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { useAppLocalization } from "@/localization/localization-provider";
import { BottomSheet } from "@/shared/ui/app-bottom-sheet";
import { FilledIcon } from "@/shared/ui/filled-icon";

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
  const [isOpen, setIsOpen] = useState(true);
  const { t } = useTranslation();
  const { direction } = useAppLocalization();
  const close = () => {
    if (!busy) setIsOpen(false);
  };
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <BottomSheet.Content
        snapPoints={["82%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={!busy}
        enableHandlePanningGesture={!busy}
        enableContentPanningGesture={!busy}
        onClose={onClose}
        contentContainerProps={{ style: { direction } }}
      >
        <View className="flex-row items-center gap-3 px-5 pb-4">
          <BottomSheet.Title className="flex-1 text-2xl">
            {title}
          </BottomSheet.Title>
          <Button
            isIconOnly
            isDisabled={busy}
            variant="ghost"
            accessibilityLabel={t("budgets.common.dismissSheet")}
            onPress={close}
          >
            <FilledIcon name="close" size={24} />
          </Button>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingBottom: 18,
            gap: 10,
          }}
        >
          {children}
        </ScrollView>
      </BottomSheet.Content>
    </BottomSheet>
  );
}
