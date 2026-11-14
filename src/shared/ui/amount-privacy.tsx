import { usePathname } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import {
  AppState,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewInstance,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useLocalData } from "@/data/local-data-provider";
import { useAppThemeColors } from "@/shared/theme/app-theme";
import {
  isVisibleNumber,
  maskPrivateNumbers,
  numberScrambleFrame,
  scrambleSeed,
  type NumberRect,
} from "@/shared/lib/number-scramble";

type NumberLabel = {
  page: string;
  read: () => { text: string; style: TextStyle };
  measure: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};
type OverlayLabel = NumberRect & {
  id: string;
  target: string;
  style: TextStyle;
  seed: number;
};
type Transition = {
  id: number;
  path: string;
  labels: OverlayLabel[];
  playing: boolean;
};
type PrivacyState = {
  hidden: boolean;
  covered: ReadonlySet<string>;
  register: (id: string, label: NumberLabel) => () => void;
  animate: (
    page: string | null,
    hiding: boolean,
    commit: () => Promise<void>,
  ) => Promise<void>;
};

const PrivacyContext = createContext<PrivacyState | null>(null);
const PageContext = createContext<string | null>(null);
const EMPTY_COVERED: ReadonlySet<string> = new Set();
// `text` is the native TextInput property updated directly on the UI runtime.
const ScrambleInput = Animated.createAnimatedComponent(
  TextInput as ComponentType<
    ComponentProps<typeof TextInput> & { text?: string }
  >,
);
const DURATION = 900;

export const useAmountPrivacy = () => useContext(PrivacyContext);
export const useAmountPrivacyPage = () => useContext(PageContext);

export function AmountPrivacyPage({
  id,
  children,
}: PropsWithChildren<{ id: string }>) {
  return <PageContext.Provider value={id}>{children}</PageContext.Provider>;
}

/** Transient presentation only; the privacy preference still commits through SQLite. */
export function AmountPrivacyProvider({ children }: PropsWithChildren) {
  const { document } = useLocalData();
  const hidden = document._local.amountsHidden;
  const path = usePathname();
  const viewport = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const registry = useRef(new Map<string, NumberLabel>());
  const generation = useRef(0);
  const busy = useRef(false);
  const root = useRef<ViewInstance | null>(null);
  const progress = useSharedValue(1);
  const [transition, setTransition] = useState<Transition | null>(null);
  const current = transition?.path === path ? transition : null;

  const finish = useCallback((id: number) => {
    setTransition((value) => (value?.id === id ? null : value));
  }, []);
  const cancel = useCallback(() => {
    generation.current++;
    cancelAnimation(progress);
    progress.set(1);
    setTransition(null);
  }, [progress]);

  useLayoutEffect(() => {
    // Synchronize the external UI-runtime animation with navigation before paint;
    // retained/frozen pages must never show an overlay from a previous visit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cancel();
  }, [path, viewport.width, viewport.height, cancel]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => {
      subscription.remove();
      cancelAnimation(progress);
    };
  }, [cancel, progress]);

  const register = useCallback((id: string, label: NumberLabel) => {
    registry.current.set(id, label);
    return () => {
      registry.current.delete(id);
    };
  }, []);

  const animate = useCallback(
    async (
      page: string | null,
      hiding: boolean,
      commit: () => Promise<void>,
    ) => {
      // Only serialize preparation/commit. A running animation can be reversed.
      if (busy.current) return;
      busy.current = true;
      const id = ++generation.current;
      try {
        if (!page || reducedMotion) {
          cancelAnimation(progress);
          setTransition(null);
          await commit();
          return;
        }
        const candidates = [...registry.current].filter(
          ([, label]) => label.page === page,
        );
        const measure = (label: Pick<NumberLabel, "measure">) =>
          new Promise<NumberRect | null>((resolve) => {
            // A recycled/unmounted native text may never invoke its measurement callback.
            const timeout = setTimeout(() => resolve(null), 100);
            label.measure((x, y, width, height) => {
              clearTimeout(timeout);
              resolve({ x, y, width, height });
            });
          });
        const [origin, ...rectangles] = await Promise.all([
          measure({
            measure: (callback) => root.current?.measureInWindow(callback),
          }),
          ...candidates.map(([, label]) => measure(label)),
        ]);
        let labels: OverlayLabel[] = [];
        if (origin && generation.current === id) {
          labels = candidates.flatMap(([key, label], index) => {
            const rect = rectangles[index];
            if (
              !rect ||
              !isVisibleNumber(rect, viewport.width, viewport.height)
            )
              return [];
            const { text, style } = label.read();
            return [
              {
                ...rect,
                x: rect.x - origin.x,
                y: rect.y - origin.y,
                id: key,
                target: hiding ? maskPrivateNumbers(text) : text,
                style,
                seed: scrambleSeed(key),
              },
            ];
          });
          cancelAnimation(progress);
          progress.set(0);
          setTransition({ id, path, labels, playing: false });
        }

        await commit();
        // Let the committed document reach the text labels. Their real native
        // text stays covered, including during a reveal, until decoding finishes.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (generation.current !== id || !labels.length) {
          finish(id);
          return;
        }
        const finalRectangles = await Promise.all(
          labels.map((label) => {
            const entry = registry.current.get(label.id);
            return entry ? measure(entry) : Promise.resolve(null);
          }),
        );
        if (generation.current !== id) return;
        labels = labels.flatMap((label, index) => {
          const entry = registry.current.get(label.id);
          const rect = finalRectangles[index];
          if (
            !entry ||
            !origin ||
            !rect ||
            !isVisibleNumber(rect, viewport.width, viewport.height)
          )
            return [];
          const target = entry.read();
          return [
            {
              ...label,
              ...rect,
              x: rect.x - origin.x,
              y: rect.y - origin.y,
              target: target.text,
              style: target.style,
            },
          ];
        });
        setTransition({ id, path, labels, playing: true });
      } catch (error) {
        finish(id);
        throw error;
      } finally {
        busy.current = false;
      }
    },
    [finish, path, progress, reducedMotion, viewport.width, viewport.height],
  );

  useEffect(() => {
    if (!current?.playing) return;
    const id = current.id;
    progress.set(
      withTiming(
        1,
        { duration: DURATION, easing: Easing.linear },
        (finished) => {
          if (finished) scheduleOnRN(finish, id);
        },
      ),
    );
  }, [current, finish, progress]);

  const covered = useMemo(
    () =>
      current
        ? new Set(current.labels.map((label) => label.id))
        : EMPTY_COVERED,
    [current],
  );
  const value = useMemo(
    () => ({ hidden, covered, register, animate }),
    [hidden, covered, register, animate],
  );
  return (
    <PrivacyContext.Provider value={value}>
      <View
        ref={root}
        collapsable={false}
        style={styles.root}
        onTouchMove={current ? cancel : undefined}
      >
        {children}
        {current && (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.overlay}
          >
            {current.labels.map((label) => (
              <NumberOverlay
                key={`${current.id}:${label.id}`}
                label={label}
                progress={progress}
              />
            ))}
          </View>
        )}
      </View>
    </PrivacyContext.Provider>
  );
}

function NumberOverlay({
  label,
  progress,
}: {
  label: OverlayLabel;
  progress: SharedValue<number>;
}) {
  const theme = useAppThemeColors();
  const animatedProps = useAnimatedProps(() => {
    const text = numberScrambleFrame(label.target, progress.get(), label.seed);
    return { text };
  });
  // Only typography belongs on the overlay. Original layout stays with the
  // native Text, so margins, flex and card geometry never animate.
  const {
    color,
    fontFamily,
    fontSize,
    fontStyle,
    fontWeight,
    letterSpacing,
    lineHeight,
    textAlign,
    writingDirection,
    textTransform,
  } = label.style;
  return (
    <ScrambleInput
      animatedProps={animatedProps}
      defaultValue={numberScrambleFrame(label.target, 0, label.seed)}
      editable={false}
      caretHidden
      contextMenuHidden
      accessible={false}
      focusable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      multiline
      style={[
        styles.number,
        {
          left: label.x,
          top: label.y,
          width: label.width,
          height: label.height,
          color: color ?? theme.foreground,
          fontFamily,
          fontSize,
          fontStyle,
          fontWeight,
          letterSpacing,
          lineHeight,
          textAlign,
          writingDirection,
          textTransform,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    overflow: "hidden",
  },
  number: {
    position: "absolute",
    padding: 0,
    margin: 0,
    borderWidth: 0,
    textAlignVertical: "top",
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
});
