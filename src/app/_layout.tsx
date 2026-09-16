import "../../global.css";

import { Huninn_400Regular } from "@expo-google-fonts/huninn/400Regular";
import { useFonts } from "expo-font";
import { NavigationBar } from "expo-navigation-bar";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type Theme,
} from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect, type PropsWithChildren } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LayoutDirection, useUniwind } from "uniwind";

import { initializeLocalDatabase } from "@/data/database/safe-startup";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { StorageBoundary } from "@/features/onboarding/storage-recovery-screen";
import { LocalDataProvider } from "@/data/local-data-provider";
import { ProfileProvider } from "@/features/profile/profile-provider";
import {
  LocalizationProvider,
  useAppLocalization,
} from "@/localization/localization-provider";
import {
  AppThemeController,
  useAppThemeColors,
} from "@/shared/theme/app-theme";
import {
  AppBottomSheetPortalHost,
  AppBottomSheetPortalLayer,
} from "@/shared/ui/app-bottom-sheet-portal";

const ROOT_BACKGROUNDS = {
  dark: "#000000",
  light: "#DCE7E0",
} as const;

function LocalizedHeroUIProvider({ children }: PropsWithChildren) {
  const { isRTL } = useAppLocalization();

  return (
    <LayoutDirection rtl={isRTL}>
      <HeroUINativeProvider config={{ isRTL }}>{children}</HeroUINativeProvider>
    </LayoutDirection>
  );
}

function AppNavigation() {
  const { theme } = useUniwind();
  const { accent, background, border, danger, foreground } =
    useAppThemeColors();
  const isDark = theme === "dark";
  const baseNavigationTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme: Theme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: accent,
      background,
      card: background,
      text: foreground,
      border,
      notification: danger,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={{ flex: 1, backgroundColor: background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: background },
          }}
        />
      </View>
    </ThemeProvider>
  );
}

function AppSystemBars() {
  const { background, isDark } = useAppThemeColors();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(background);
  }, [background]);
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NavigationBar style={isDark ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout() {
  const { theme } = useUniwind();
  const [fontsLoaded, fontError] = useFonts({
    Huninn_400Regular,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: ROOT_BACKGROUNDS[theme === "dark" ? "dark" : "light"],
      }}
    >
      <StorageBoundary>
        <SQLiteProvider
          databaseName="budget-manager.db"
          onInit={initializeLocalDatabase}
        >
          <LocalDataProvider>
            <LocalizationProvider>
              <LocalizedHeroUIProvider>
                <AppThemeController />
                <AppSystemBars />
                <AppBottomSheetPortalLayer>
                  <View style={{ flex: 1 }}>
                    <OnboardingGate>
                      <ProfileProvider>
                        <AppNavigation />
                      </ProfileProvider>
                    </OnboardingGate>
                    <AppBottomSheetPortalHost />
                  </View>
                </AppBottomSheetPortalLayer>
              </LocalizedHeroUIProvider>
            </LocalizationProvider>
          </LocalDataProvider>
        </SQLiteProvider>
      </StorageBoundary>
    </GestureHandlerRootView>
  );
}
