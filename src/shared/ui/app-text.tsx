import type { ComponentType } from "react";
import { Text as NativeText, Platform, type TextProps } from "react-native";

import { useAppLocalization } from "@/localization/localization-provider";

type LocalizedTextProps = TextProps & {
  dir?: "ltr" | "rtl";
  lang?: string;
};
const WebText = NativeText as ComponentType<LocalizedTextProps>;

export function Text({ style, ...props }: TextProps) {
  const { direction, language } = useAppLocalization();

  return (
    <WebText
      {...props}
      dir={Platform.OS === "web" ? direction : undefined}
      lang={Platform.OS === "web" ? language : undefined}
      style={[
        Platform.OS === "web"
          ? undefined
          : { textAlign: "left", writingDirection: direction },
        style,
      ]}
    />
  );
}
