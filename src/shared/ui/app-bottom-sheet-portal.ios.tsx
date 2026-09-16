import type { BottomSheetPortalProps } from "heroui-native";
import type { PropsWithChildren } from "react";

// SwiftUI owns the modal window, backdrop and accessibility focus on iOS.
export function AppBottomSheetPortalLayer({ children }: PropsWithChildren) {
  return <>{children}</>;
}
export function AppBottomSheetPortalHost() {
  return null;
}
export function AppBottomSheetPortal({
  children,
}: Omit<BottomSheetPortalProps, "hostName"> & { isOpen: boolean }) {
  return <>{children}</>;
}
