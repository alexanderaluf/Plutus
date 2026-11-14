import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import { I18nextProvider } from "react-i18next";
import { I18nManager, Platform, View, type ViewProps } from "react-native";

import { useLocalData } from "@/data/local-data-provider";
import type { AppLanguage } from "@/data/model/backup-document";

import { i18n } from "./i18n";

type AppDirection = "ltr" | "rtl";

type LocalizationContextValue = {
  direction: AppDirection;
  isRTL: boolean;
  language: AppLanguage;
  setPreviewLanguage: (language: AppLanguage | null) => void;
};

const nativeIsRTL = I18nManager.isRTL;
const LocalizationContext = createContext<LocalizationContextValue>({
  direction: nativeIsRTL ? "rtl" : "ltr",
  isRTL: nativeIsRTL,
  language:
    i18n.resolvedLanguage === "he" || i18n.resolvedLanguage === "ru"
      ? i18n.resolvedLanguage
      : "en",
  setPreviewLanguage: () => undefined,
});
const DirectionalView = View as ComponentType<
  ViewProps & { dir?: AppDirection }
>;

export function LocalizationProvider({ children }: PropsWithChildren) {
  const { document } = useLocalData();
  const [previewLanguage, setPreviewLanguage] = useState<AppLanguage | null>(
    null,
  );
  const language = previewLanguage ?? document._local.appLanguage;
  const isRTL = language === "he";
  const direction: AppDirection = isRTL ? "rtl" : "ltr";

  // Bundled resources + initImmediate: false let i18next switch language
  // synchronously without hiding the initial tree behind an async loading gate.
  if (i18n.resolvedLanguage !== language) {
    void i18n.changeLanguage(language);
  }

  useEffect(() => {
    if (i18n.resolvedLanguage !== language) {
      void i18n.changeLanguage(language);
    }
    if (Platform.OS !== "web" && I18nManager.isRTL !== isRTL) {
      I18nManager.allowRTL(true);
      I18nManager.swapLeftAndRightInRTL(true);
      I18nManager.forceRTL(isRTL);
    }
  }, [isRTL, language]);

  const contextValue = useMemo(
    () => ({ direction, isRTL, language, setPreviewLanguage }),
    [direction, isRTL, language],
  );
  const containerStyle = useMemo(
    () => ({ direction, flex: 1 }),
    [direction],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LocalizationContext.Provider value={contextValue}>
        <DirectionalView dir={direction} style={containerStyle}>
          {children}
        </DirectionalView>
      </LocalizationContext.Provider>
    </I18nextProvider>
  );
}

export function useAppLocalization() {
  return useContext(LocalizationContext);
}
