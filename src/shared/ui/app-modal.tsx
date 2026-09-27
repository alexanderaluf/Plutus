import { KeyboardAvoidingView, Modal, Pressable, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppModalProps } from "./app-modal.types";

/**
 * One Android presentation surface for dialogs, sheets, and full-screen pickers.
 * The native Modal provides focus, back handling, and a separate window; all
 * visible chrome is drawn here rather than by Android's system alert UI.
 */
export function AppModal({
  children,
  presentation = "dialog",
  dismissable = true,
  backdropLabel = "Dismiss",
  sheetHeight = "82%",
  onRequestClose,
  visible,
  ...props
}: AppModalProps) {
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === "dark";
  const surface = dark ? "#202625" : "#FFFFFF";
  const border = dark ? "#3B4844" : "#D8E2DC";
  const backdrop = "rgba(0, 0, 0, 0.64)";
  const fullScreen = presentation === "fullScreen";
  const sheet = presentation === "sheet";
  const close = () => {
    if (dismissable) onRequestClose?.();
  };

  return (
    <Modal
      {...props}
      visible={visible}
      transparent={!fullScreen}
      animationType={props.animationType ?? (fullScreen || sheet ? "slide" : "fade")}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      {fullScreen ? children : (
        <KeyboardAvoidingView
          behavior="height"
          style={{
            flex: 1,
            justifyContent: sheet ? "flex-end" : "center",
            alignItems: sheet ? "stretch" : "center",
            paddingTop: insets.top + 16,
            paddingBottom: sheet ? 0 : insets.bottom + 16,
            paddingHorizontal: sheet ? 0 : 20,
            backgroundColor: backdrop,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backdropLabel}
            onPress={close}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: sheet ? "100%" : "100%",
              maxWidth: sheet ? undefined : 440,
              maxHeight: sheet ? "100%" : "85%",
              height: sheet ? sheetHeight : undefined,
              borderTopLeftRadius: sheet ? 30 : 28,
              borderTopRightRadius: sheet ? 30 : 28,
              borderBottomLeftRadius: sheet ? 0 : 28,
              borderBottomRightRadius: sheet ? 0 : 28,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: surface,
              paddingBottom: sheet ? Math.max(insets.bottom, 16) : 0,
              overflow: "hidden",
            }}
          >
            {children}
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
}
