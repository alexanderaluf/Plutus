import { Modal } from "react-native";

import type { AppModalProps } from "./app-modal.types";

/** iOS keeps React Native's existing native modal presentation. */
export function AppModal({
  presentation: _presentation,
  dismissable: _dismissable,
  backdropLabel: _backdropLabel,
  sheetHeight: _sheetHeight,
  ...props
}: AppModalProps) {
  return <Modal {...props} />;
}
