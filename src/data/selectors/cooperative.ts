// Generator selectors are run to completion synchronously. They read only the
// shared per-document index (see document-memo.ts), so a full time-sliced
// scheduler is unnecessary: one month of records finishes within a frame, and
// slicing it across idle callbacks only turned that work into loading spinners.
export function finishProjection<T>(work: Generator<void, T, unknown>): T {
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

/** Stable merge sort with bounded steps; Array.sort cannot yield to input. */
export function* sortProjection<T>(
  values: T[],
  compare: (a: T, b: T) => number,
): Generator<void, T[], unknown> {
  if (values.length < 2) return values;
  let source = values;
  let target = new Array<T>(values.length);
  let operations = 0;
  for (let size = 1; size < values.length; size *= 2) {
    for (let start = 0; start < values.length; start += size * 2) {
      const middle = Math.min(start + size, values.length);
      const end = Math.min(start + size * 2, values.length);
      let left = start,
        right = middle;
      for (let output = start; output < end; output++) {
        target[output] =
          right >= end ||
          (left < middle && !(compare(source[left], source[right]) > 0))
            ? source[left++]
            : source[right++];
        if (++operations % 128 === 0) yield;
      }
    }
    [source, target] = [target, source];
  }
  return source;
}

export function* filterProjection<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): Generator<void, T[], unknown> {
  const result: T[] = [];
  for (let index = 0; index < values.length; index++) {
    if (index % 64 === 0) yield;
    if (predicate(values[index])) result.push(values[index]);
  }
  return result;
}
