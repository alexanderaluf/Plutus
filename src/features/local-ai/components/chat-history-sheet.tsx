import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AIChat } from "@/data/model/ai-chat-record";
import { useAppLocalization } from "@/localization/localization-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import { AppAlert } from "@/shared/ui/app-alert";
import { Text } from "@/shared/ui/app-text";
import { FilledIcon } from "@/shared/ui/filled-icon";

type Props = {
  open: boolean;
  chats: AIChat[];
  activeId: string | null;
  onClose: () => void;
  onOpenChat: (chat: AIChat) => void;
  onNewChat: () => void;
  onRename: (chat: AIChat, title: string) => Promise<void>;
  onTogglePin: (chat: AIChat) => Promise<void>;
  onDelete: (chat: AIChat) => Promise<void>;
};

/** Saved ChatGPT chats in a sheet that slides in from the start edge. */
export function ChatHistorySheet({ open, chats, activeId, onClose, onOpenChat, onNewChat, onRename, onTogglePin, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const { isRTL } = useAppLocalization();
  const colors = useAppThemeColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.min(360, Math.round(screenWidth * 0.86));
  const [progress] = useState(() => new Animated.Value(0));
  // Stays mounted while the closing animation runs.
  const [mounted, setMounted] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMounted(true);
      setError("");
    } else {
      setExpanded(null);
      setRenaming(null);
    }
  }

  useEffect(() => {
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: open ? 220 : 180, useNativeDriver: true })
      .start(({ finished }) => { if (finished && !open) setMounted(false); });
  }, [open, progress]);

  const run = async (chat: AIChat, action: () => Promise<void>) => {
    setPending(chat.id);
    setError("");
    try {
      await action();
      setExpanded(null);
      setRenaming(null);
    } catch {
      setError(t("localAI.history.actionFailed"));
    } finally {
      setPending(null);
    }
  };

  const confirmDelete = (chat: AIChat) =>
    AppAlert.alert(t("localAI.history.deleteTitle"), t("localAI.history.deleteMessage", { title: chat.title }), [
      { text: t("localAI.cancel"), style: "cancel" },
      { text: t("localAI.history.delete"), style: "destructive", onPress: () => void run(chat, () => onDelete(chat)) },
    ]);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? date.toLocaleTimeString(i18n.language, { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  };

  const pinned = chats.filter((chat) => chat.pinned);
  const recent = chats.filter((chat) => !chat.pinned);
  const offscreen = isRTL ? width : -width;

  const row = (chat: AIChat) => {
    const isExpanded = expanded === chat.id;
    const isRenaming = renaming?.id === chat.id;
    const busy = pending === chat.id;
    return (
      <View key={chat.id} className={`rounded-2xl ${chat.id === activeId ? "bg-accent/15" : ""}`}>
        {isRenaming ? (
          <View className="flex-row items-center gap-2 px-2 py-2">
            <TextInput
              value={renaming.title}
              onChangeText={(title) => setRenaming({ id: chat.id, title })}
              onSubmitEditing={() => void run(chat, () => onRename(chat, renaming.title))}
              autoFocus
              selectTextOnFocus
              maxLength={120}
              returnKeyType="done"
              accessibilityLabel={t("localAI.history.rename")}
              className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground"
              placeholderTextColor={colors.muted}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={t("localAI.history.save")} disabled={busy || !renaming.title.trim()}
              onPress={() => void run(chat, () => onRename(chat, renaming.title))} className="size-10 items-center justify-center rounded-full bg-accent">
              {busy ? <ActivityIndicator color={colors.background} /> : <FilledIcon name="check" size={20} color={colors.background} />}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("localAI.cancel")} onPress={() => setRenaming(null)}
              className="size-10 items-center justify-center rounded-full bg-surface-secondary">
              <FilledIcon name="close" size={20} />
            </Pressable>
          </View>
        ) : (
          <View className="flex-row items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: chat.id === activeId }}
              onPress={() => onOpenChat(chat)}
              className="min-h-14 flex-1 justify-center gap-0.5 py-2 ps-3"
            >
              <View className="flex-row items-center gap-1.5">
                {chat.pinned && <FilledIcon name="pin" size={14} tone="muted" />}
                <Text numberOfLines={1} className="flex-1 font-manrope-semibold text-[15px] text-foreground">{chat.title}</Text>
              </View>
              <Text className="text-xs text-muted">{formatDate(chat.lastMessageAt)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("localAI.history.options", { title: chat.title })}
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => setExpanded(isExpanded ? null : chat.id)}
              className="size-11 items-center justify-center"
            >
              {busy ? <ActivityIndicator /> : <FilledIcon name="more-vert" size={20} tone="muted" />}
            </Pressable>
          </View>
        )}
        {isExpanded && !isRenaming && (
          <View className="flex-row gap-2 px-2 pb-2">
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(chat, () => onTogglePin(chat))}
              className="min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-secondary px-2">
              <FilledIcon name={chat.pinned ? "pin-off" : "pin"} size={16} />
              <Text className="text-sm text-foreground">{t(chat.pinned ? "localAI.history.unpin" : "localAI.history.pin")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setRenaming({ id: chat.id, title: chat.title })}
              className="min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-secondary px-2">
              <FilledIcon name="pencil" size={16} />
              <Text className="text-sm text-foreground">{t("localAI.history.rename")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => confirmDelete(chat)}
              className="min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-danger/10 px-2">
              <FilledIcon name="delete" size={16} tone="danger" />
              <Text className="text-sm text-danger">{t("localAI.history.delete")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View className="flex-1">
        <Animated.View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)", opacity: progress }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("localAI.history.close")} onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            start: 0,
            width,
            backgroundColor: colors.background,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 8,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [offscreen, 0] }) }],
          }}
        >
          <View className="flex-row items-center gap-2 px-4 pb-3">
            <Text accessibilityRole="header" className="flex-1 font-manrope-bold text-xl text-foreground">{t("localAI.history.title")}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("localAI.history.close")} onPress={onClose}
              className="size-10 items-center justify-center rounded-full bg-surface-secondary">
              <FilledIcon name="close" size={22} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={onNewChat}
            className="mx-3 mb-3 min-h-12 flex-row items-center gap-3 rounded-2xl bg-surface px-4">
            <FilledIcon name="new-chat" size={20} />
            <Text className="font-manrope-semibold text-foreground">{t("localAI.newChat")}</Text>
          </Pressable>
          {!!error && <Text accessibilityRole="alert" className="mx-4 mb-2 text-sm text-danger">{error}</Text>}
          <ScrollView contentContainerClassName="gap-1 px-2 pb-4" keyboardShouldPersistTaps="handled">
            {chats.length === 0 && (
              <Text className="px-3 py-6 text-center text-sm leading-5 text-muted">{t("localAI.history.empty")}</Text>
            )}
            {pinned.length > 0 && (
              <Text className="px-3 pb-1 pt-2 text-[12px] font-manrope-semibold uppercase tracking-widest text-muted">{t("localAI.history.pinned")}</Text>
            )}
            {pinned.map(row)}
            {pinned.length > 0 && recent.length > 0 && (
              <Text className="px-3 pb-1 pt-4 text-[12px] font-manrope-semibold uppercase tracking-widest text-muted">{t("localAI.history.recent")}</Text>
            )}
            {recent.map(row)}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
