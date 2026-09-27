import type { PropsWithChildren } from "react";
import type { DimensionValue, ModalProps } from "react-native";

export type AppModalProps = PropsWithChildren<
  Omit<ModalProps, "children" | "onRequestClose"> & {
    onRequestClose?: () => void;
    presentation?: "dialog" | "sheet" | "fullScreen";
    dismissable?: boolean;
    backdropLabel?: string;
    sheetHeight?: DimensionValue;
  }
>;
