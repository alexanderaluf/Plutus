// Selectors remain usable synchronously by detail screens and tests. Home uses
// the same generators with a small time budget, outside React render.
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

type ProjectionTask = { step: () => boolean };
// One budget shared by all home projections, not 3ms per concurrent job. This
// queue is transient scheduling state and never an authoritative record store.
const tasks = new Set<ProjectionTask>();
let scheduled:
  { handle: number | ReturnType<typeof setTimeout>; idle: boolean } | undefined;

function cancelScheduled() {
  if (!scheduled) return;
  if (scheduled.idle) cancelIdleCallback(scheduled.handle as number);
  else clearTimeout(scheduled.handle);
  scheduled = undefined;
}
function scheduleProjectionSlice() {
  if (scheduled || !tasks.size) return;
  const idle = typeof requestIdleCallback === "function";
  scheduled = {
    idle,
    handle: idle
      ? requestIdleCallback(projectionSlice, { timeout: 100 })
      : setTimeout(() => projectionSlice(), 0),
  };
}
function projectionSlice(deadline?: IdleDeadline) {
  scheduled = undefined;
  const start = performance.now();
  let steps = 0;
  do {
    const task = tasks.values().next().value;
    if (!task) break;
    tasks.delete(task);
    if (!task.step()) tasks.add(task);
    steps++;
  } while (
    tasks.size &&
    steps < 4096 &&
    performance.now() - start < 3 &&
    (!deadline || deadline.timeRemaining() > 1)
  );
  scheduleProjectionSlice();
}

export function runProjection<T>(
  work: Generator<void, T, unknown>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      tasks.delete(task);
      if (!tasks.size) cancelScheduled();
      work.return(undefined as T);
      cleanup();
      reject(new Error("Projection cancelled"));
    };
    const task: ProjectionTask = {
      step: () => {
        try {
          const step = work.next();
          if (step.done) {
            cleanup();
            resolve(step.value);
            return true;
          }
          return false;
        } catch (error) {
          cleanup();
          reject(error);
          return true;
        }
      },
    };
    if (signal.aborted) {
      reject(new Error("Projection cancelled"));
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    tasks.add(task);
    scheduleProjectionSlice();
  });
}
