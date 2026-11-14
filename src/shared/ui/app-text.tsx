import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import {
  Text as NativeText,
  Platform,
  StyleSheet,
  type TextProps,
  type TextInstance,
  type TextStyle,
} from "react-native";
import { useResolveClassNames } from "uniwind";

import { useAppLocalization } from "@/localization/localization-provider";
import {
  hasPrivateNumber,
  maskPrivateNumbers,
} from "@/shared/lib/number-scramble";
import { useAmountPrivacy, useAmountPrivacyPage } from "./amount-privacy";

type LocalizedTextProps = TextProps & {
  dir?: "ltr" | "rtl";
  lang?: string;
  ref?: Ref<TextInstance>;
};
const WebText = NativeText as ComponentType<LocalizedTextProps>;

type AppTextProps = TextProps & { privacyAnimation?: boolean };

export function Text({
  style,
  privacyAnimation = true,
  ...props
}: AppTextProps) {
  const { direction, language } = useAppLocalization();
  const privacy = useAmountPrivacy();
  const page = useAmountPrivacyPage();
  const content = plainText(props.children);
  const localizedStyle = [
    Platform.OS === "web"
      ? undefined
      : { textAlign: "left" as const, writingDirection: direction },
    style,
  ];

  if (privacy && page && content !== null && hasPrivateNumber(content)) {
    return (
      <PrivateNumberText
        {...props}
        style={localizedStyle}
        content={content}
        page={page}
        privacy={privacy}
        animate={privacyAnimation}
      />
    );
  }

  return (
    <WebText
      {...props}
      dir={Platform.OS === "web" ? direction : undefined}
      lang={Platform.OS === "web" ? language : undefined}
      style={localizedStyle}
    />
  );
}

// Keep rich/nested text intact; its numeric leaf Text nodes register themselves.
function plainText(children: ReactNode): string | null {
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (children == null || typeof children === "boolean") return "";
  if (!Array.isArray(children)) return null;
  const parts = children.map(plainText);
  return parts.every((part) => part !== null) ? parts.join("") : null;
}

function PrivateNumberText({
  content,
  page,
  privacy,
  animate,
  style,
  ref,
  ...props
}: TextProps & {
  content: string;
  page: string;
  privacy: NonNullable<ReturnType<typeof useAmountPrivacy>>;
  ref?: Ref<TextInstance>;
  animate: boolean;
}) {
  const { direction, language } = useAppLocalization();
  const id = useId();
  const native = useRef<TextInstance | null>(null);
  const resolved = useResolveClassNames(props.className ?? "");
  const text = privacy.hidden ? maskPrivateNumbers(content) : content;
  const covered = privacy.covered.has(id);
  const register = privacy.register;
  const latest = useRef({ text, style: {} as TextStyle });
  useLayoutEffect(() => {
    latest.current = {
      text,
      style: StyleSheet.flatten([resolved, style]) as TextStyle,
    };
  });
  const setRef = useCallback(
    (instance: TextInstance | null) => {
      native.current = instance;
      if (typeof ref === "function") ref(instance);
      else if (ref) ref.current = instance;
    },
    [ref],
  );
  useLayoutEffect(
    () =>
      animate
        ? register(id, {
            page,
            read: () => latest.current,
            measure: (callback) => native.current?.measureInWindow(callback),
          })
        : undefined,
    [animate, id, page, register],
  );

  return (
    <WebText
      {...props}
      ref={setRef}
      dir={Platform.OS === "web" ? direction : undefined}
      lang={Platform.OS === "web" ? language : undefined}
      selectable={privacy.hidden || covered ? false : props.selectable}
      accessibilityLabel={
        privacy.hidden || covered
          ? maskPrivateNumbers(props.accessibilityLabel ?? text)
          : props.accessibilityLabel
      }
      style={[style, covered && { opacity: 0 }]}
    >
      {text}
    </WebText>
  );
}
