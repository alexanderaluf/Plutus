import { Easing, FadeInDown, ReduceMotion } from "react-native-reanimated";

/** How far below its place an element starts, in points. */
const ENTRANCE_RISE = 48;
/** How long one element takes to fade in and settle. */
const ENTRANCE_DURATION = 480;
/** Gap between the starts of consecutive list items. */
const ENTRANCE_STAGGER = 110;
/** Items past this position start with it, so long lists stay quick. */
const ENTRANCE_MAX_INDEX = 6;

/**
 * The page entrance: each element fades in while rising into place. Pair it
 * with `listEntranceDelay` so list items arrive one after another.
 */
export const entranceAnimation = (delay = 0) =>
  FadeInDown.duration(ENTRANCE_DURATION)
    .delay(delay)
    .withInitialValues({
      opacity: 0,
      transform: [{ translateY: ENTRANCE_RISE }],
    })
    .easing(Easing.bezier(0.22, 1, 0.36, 1))
    .reduceMotion(ReduceMotion.System);

/** Delay of the item at `index` in a list that enters after its header. */
export const listEntranceDelay = (index: number) =>
  100 + Math.min(index, ENTRANCE_MAX_INDEX) * ENTRANCE_STAGGER;
