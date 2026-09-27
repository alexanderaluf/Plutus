import { useEffect, useState } from "react";
import { InfoFill } from "@material-symbols-svg/react-native/rounded/icons/info";
import { WarningFill } from "@material-symbols-svg/react-native/rounded/icons/warning";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
  type AlertButton,
  type AlertOptions,
} from "react-native";

import { i18n } from "@/localization/i18n";
import { AppModal } from "./app-modal";

type AlertRequest = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
};

const pending: AlertRequest[] = [];
let wakeHost: (() => void) | null = null;

/** Same call shape as Alert.alert; iOS still delegates to the native alert. */
export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) {
    if (Platform.OS !== "android") {
      Alert.alert(title, message, buttons, options);
      return;
    }
    pending.push({ title, message, buttons, options });
    wakeHost?.();
  },
};

/**
 * Mounted above the storage boundary so even recovery errors can show the
 * Android dialog. Requests are transient UI state and never persisted.
 */
export function AppAlertHost() {
  const [request, setRequest] = useState<AlertRequest | null>(null);
  const dark = useColorScheme() === "dark";
  const foreground = dark ? "#F4F7F5" : "#17231F";
  const muted = dark ? "#AFBAB5" : "#57645E";
  const secondary = dark ? "#2D3633" : "#EEF3EF";
  const accent = dark ? "#70D2EB" : "#087E8B";
  const accentForeground = dark ? "#083442" : "#FFFFFF";
  const danger = dark ? "#FF958A" : "#BB4034";

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const wake = () => setRequest((current) => current ?? pending.shift() ?? null);
    wakeHost = wake;
    wake();
    return () => {
      if (wakeHost === wake) wakeHost = null;
    };
  }, []);

  if (Platform.OS !== "android") return null;

  function next(onPress?: AlertButton["onPress"]) {
    setRequest(pending.shift() ?? null);
    onPress?.();
    // An action may synchronously enqueue another alert.
    wakeHost?.();
  }

  function dismiss() {
    if (!request?.options?.cancelable) return;
    const onDismiss = request.options.onDismiss;
    setRequest(pending.shift() ?? null);
    onDismiss?.();
    wakeHost?.();
  }

  const buttons = request?.buttons?.length
    ? request.buttons
    : [{ text: i18n.t("common.okay") }];
  const actions = buttons.filter((button) => button.style !== "cancel");
  const cancels = buttons.filter((button) => button.style === "cancel");
  const destructive = actions.some((button) => button.style === "destructive");

  return (
    <AppModal
      visible={!!request}
      presentation="dialog"
      dismissable={!!request?.options?.cancelable}
      backdropLabel={i18n.t("common.cancel")}
      onRequestClose={dismiss}
    >
      {request && (
        <View style={{ padding: 24, gap: 20 }}>
          <View
            style={{
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 17,
              backgroundColor: destructive
                ? dark ? "#50312E" : "#FCE9E6"
                : dark ? "#263D42" : "#DDF3F5",
            }}
          >
            {destructive ? (
              <WarningFill color={danger} size={26} />
            ) : (
              <InfoFill color={accent} size={26} />
            )}
          </View>
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="header"
              style={{ color: foreground, fontSize: 20, fontWeight: "700", lineHeight: 27 }}>
              {request.title}
            </Text>
            {!!request.message && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 260 }}
                contentContainerStyle={{ paddingBottom: 2 }}
              >
                <Text selectable style={{ color: muted, fontSize: 15, lineHeight: 23 }}>
                  {request.message}
                </Text>
              </ScrollView>
            )}
          </View>
          <View style={{ gap: 10 }}>
            {actions.map((button, index) => {
              const dangerAction = button.style === "destructive";
              return (
                <Pressable
                  key={`${index}-${button.text ?? ""}`}
                  accessibilityRole="button"
                  onPress={() => next(button.onPress)}
                  style={({ pressed }) => ({
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 16,
                    paddingHorizontal: 16,
                    backgroundColor: dangerAction ? danger : accent,
                    opacity: pressed ? 0.78 : 1,
                  })}
                >
                  <Text style={{ color: dangerAction ? (dark ? "#4C130E" : "#FFFFFF") : accentForeground, fontSize: 15, fontWeight: "700" }}>
                    {button.text ?? i18n.t("common.okay")}
                  </Text>
                </Pressable>
              );
            })}
            {cancels.map((button, index) => (
              <Pressable
                key={`cancel-${index}-${button.text ?? ""}`}
                accessibilityRole="button"
                onPress={() => next(button.onPress)}
                style={({ pressed }) => ({
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  backgroundColor: secondary,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: foreground, fontSize: 15, fontWeight: "600" }}>
                  {button.text ?? i18n.t("common.cancel")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </AppModal>
  );
}
