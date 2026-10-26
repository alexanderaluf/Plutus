import { createURL } from "expo-linking";
import type { TFunction } from "i18next";
import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { AppAlert } from "@/shared/ui/app-alert";
import {
  cancelChatGPTSignIn, connectChatGPT, disconnectChatGPT, getChatGPTSnapshot,
  initializeChatGPT, loadChatGPTModels, selectChatGPTModel, subscribeChatGPT,
} from "./chatgpt-service";
import { CHATGPT_CONNECTIONS_URL, CHATGPT_RETURN_PATH, CHATGPT_USAGE_URL } from "./chatgpt-protocol";

export function chatGPTMessageKey(code: string) {
  if (/usage_limit_exceeded/.test(code)) return "limit";
  if (/not_eligible|invalid_user/.test(code)) return "eligibility";
  if (/unauthorized|invalid_grant|refresh_token|token_expired/.test(code)) return "unauthorized";
  if (/scope_not_authorized|invalid_authorization_context|permission/.test(code)) return "permission";
  if (/unsupported_capability|unsupported/.test(code)) return "unsupported";
  if (/identity/.test(code)) return "identity";
  if (/storage/.test(code)) return "storage";
  if (/models/.test(code)) return "models";
  if (/declined|cancelled/.test(code)) return "declined";
  if (/incomplete/.test(code)) return "incomplete";
  if (/^(signin|timeout)/.test(code)) return "signin";
  if (code === "network") return "network";
  return "service";
}

/** Shows OpenAI's error code for sign-in and service failures, so they are not mistaken for connectivity. */
export function chatGPTErrorMessage(t: TFunction, code: string) {
  const key = chatGPTMessageKey(code);
  return t(`localAI.chatgpt.errors.${key}` as "localAI.chatgpt.errors.service", { code: code.replace(/^signin:/, "") });
}

export function useChatGPT() {
  const { t } = useTranslation();
  const state = useSyncExternalStore(subscribeChatGPT, getChatGPTSnapshot, getChatGPTSnapshot);
  useEffect(() => { void initializeChatGPT(); }, []);
  useEffect(() => {
    if (state.hydrated && state.planEnabled) void loadChatGPTModels();
  }, [state.hydrated, state.planEnabled, state.activeClientId]);

  const errorMessage = state.error ? chatGPTErrorMessage(t, state.error) : "";
  const connect = (clientId?: string) => {
    AppAlert.alert(t("localAI.chatgpt.connectTitle"), t("localAI.chatgpt.consent"), [
      { text: t("localAI.cancel"), style: "cancel" },
      { text: t("localAI.chatgpt.continue"), onPress: () => {
        // The +native-intent handler keeps the current screen when this link returns to the app.
        const page = { url: createURL(CHATGPT_RETURN_PATH), title: t("localAI.chatgpt.returnTitle"),
          message: t("localAI.chatgpt.returnMessage"), action: t("localAI.chatgpt.returnAction") };
        void connectChatGPT(clientId, page).then((welcome) => {
          if (welcome) AppAlert.alert(t("localAI.chatgpt.welcomeTitle"), t("localAI.chatgpt.welcomeDescription"));
        }).catch(() => undefined);
      } },
    ]);
  };
  const disconnect = () => AppAlert.alert(t("localAI.chatgpt.disconnect"), t("localAI.chatgpt.disconnectConfirm"), [
    { text: t("localAI.cancel"), style: "cancel" },
    { text: t("localAI.chatgpt.disconnect"), style: "destructive", onPress: () => {
      void disconnectChatGPT().then((revoked) => {
        if (!revoked) AppAlert.alert(t("localAI.chatgpt.disconnected"), t("localAI.chatgpt.revocationUnconfirmed"), [
          { text: t("common.okay") },
          { text: t("localAI.chatgpt.manageAccess"), onPress: () => void Linking.openURL(CHATGPT_CONNECTIONS_URL).catch(() => undefined) },
        ]);
      }).catch(() => AppAlert.alert(t("localAI.chatgpt.disconnect"), t("localAI.chatgpt.errors.storage")));
    } },
  ]);
  const manageUsage = () => void Linking.openURL(CHATGPT_USAGE_URL).catch(() =>
    AppAlert.alert(t("localAI.chatgpt.manageUsage"), t("localAI.chatgpt.errors.network")));
  return { ...state, errorMessage, connect, disconnect, manageUsage, cancel: cancelChatGPTSignIn,
    refreshModels: loadChatGPTModels, selectModel: selectChatGPTModel };
}
