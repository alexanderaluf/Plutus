import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { View, type ViewProps } from "react-native";
import Animated from "react-native-reanimated";

import { entranceAnimation, listEntranceDelay } from "./entrance-motion";

/**
 * Page entrance building blocks. Every page enters top to bottom: the element
 * at slot 0 starts at once, each next slot starts while the previous one is
 * still appearing. Pushed pages mount on every visit, so mounting plays it;
 * give a block a new `key` to replay it (e.g. when a selector changes view).
 */
export function slotEntrance(slot: number) {
  return entranceAnimation(slot <= 0 ? 0 : listEntranceDelay(slot - 1));
}

/** One block entering at `slot`. */
export function EntranceView({
  slot,
  ...props
}: ComponentProps<typeof Animated.View> & { slot: number }) {
  return <Animated.View {...props} entering={slotEntrance(slot)} />;
}

/**
 * Children with fragments unwrapped. Each keeps a key that is unique across
 * the flattened list: nested keys are prefixed with their fragment's key, so
 * `.0` inside a fragment never collides with a sibling `.0`.
 */
function flatten(
  children: ReactNode,
  prefix = "",
): { key: string; node: ReactNode }[] {
  return Children.toArray(children).flatMap((child, index) => {
    const key = `${prefix}${
      isValidElement(child) && child.key != null ? child.key : index
    }`;
    return isValidElement<{ children?: ReactNode }>(child) &&
      child.type === Fragment
      ? flatten(child.props.children, `${key}/`)
      : [{ key, node: child }];
  });
}

/**
 * Wraps each child in an animated view taking the next entrance slot,
 * starting at `startSlot`. Fragments are unwrapped, so conditional groups
 * still enter item by item.
 */
export function entranceChildren(children: ReactNode, startSlot = 0) {
  return flatten(children).map(({ key, node }, index) => (
    <Animated.View key={key} entering={slotEntrance(startSlot + index)}>
      {node}
    </Animated.View>
  ));
}

/** Lays out its children like a `View`; each one enters in turn. */
export function EntranceSections({
  children,
  startSlot = 0,
  ...props
}: ViewProps & { startSlot?: number }) {
  return <View {...props}>{entranceChildren(children, startSlot)}</View>;
}

/** Rows mounting this long after an entrance appear without animating. */
const ENTRY_WINDOW_MS = 900;
/** List rows past this position never animate; they start below the fold. */
const MAX_ANIMATED_ROW = 10;

type Replay = { key: string | undefined; count: number };

/**
 * Entrance for virtualized list rows. `rowEntering(index)` animates only the
 * rows that mount as part of the page entrance (or a replay); rows reached
 * later by scrolling, paging or filtering appear immediately. Use
 * `rowEntering(-1)` for a list header that enters just before the rows.
 *
 * A new `replayKey` (e.g. a selector's value) replays the rows: key their
 * animated views on `rowKey`; the first row then takes `replayFirstRowSlot`,
 * since the page header above does not enter again. `enteredAt` lets a kept
 * tab report its latest entry instead of its mount.
 */
export function useListEntrance(
  firstRowSlot: number,
  {
    replayKey,
    replayFirstRowSlot = 0,
    enteredAt,
  }: {
    replayKey?: string;
    replayFirstRowSlot?: number;
    enteredAt?: () => number;
  } = {},
) {
  const [mountedAt] = useState(() => Date.now());
  const [replay, setReplay] = useState<Replay>({ key: replayKey, count: 0 });
  // Adjusting state during render: rows of the new view already mount with
  // the new key, so they never flash in unanimated first.
  let current = replay;
  if (replay.key !== replayKey) {
    current = { key: replayKey, count: replay.count + 1 };
    setReplay(current);
  }
  const replayCount = current.count;
  // A replay's window opens when its first row asks for an entrance.
  const replayStart = useRef({ count: 0, at: 0 });
  const rowEntering = useCallback(
    (index: number) => {
      if (replayStart.current.count !== replayCount)
        replayStart.current = { count: replayCount, at: Date.now() };
      const replayedAt = replayStart.current.at;
      const entered = Math.max(mountedAt, enteredAt?.() ?? 0);
      const replayed = replayedAt > entered;
      const start = replayed ? replayedAt : entered;
      const base = replayed ? replayFirstRowSlot : firstRowSlot;
      return index <= MAX_ANIMATED_ROW && Date.now() - start < ENTRY_WINDOW_MS
        ? slotEntrance(base + index)
        : undefined;
    },
    [
      mountedAt,
      enteredAt,
      firstRowSlot,
      replayCount,
      replayFirstRowSlot,
    ],
  );
  return { rowKey: String(replayCount), rowEntering };
}
