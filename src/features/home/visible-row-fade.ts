export type VisibleRow = {
  key: string;
  index: number | null;
  isViewable: boolean;
};
type RowAnimation = {
  reveal: (delay: number) => void;
  finish: () => void;
  hide: () => void;
};

const STAGGER_MS = 40;
const MAX_DELAY_MS = 240;

// UI-only state for one section visit. Virtualized rows can unmount without
// losing their reveal history; mounting an off-screen row never starts a fade.
export function createVisibleRowFade(clock: () => number = Date.now) {
  const seen = new Set<string>();
  const visible = new Map<string, { start: number; delivered: boolean }>();
  const listeners = new Map<string, RowAnimation>();

  const hasSeen = (key: string) => {
    const pending = visible.get(key);
    return seen.has(key) || !!(pending?.delivered && pending.start <= clock());
  };

  return {
    hasSeen,
    register(key: string, animation: RowAnimation) {
      listeners.set(key, animation);
      if (hasSeen(key)) animation.finish();
      else if (visible.has(key)) {
        const pending = visible.get(key)!;
        animation.reveal(Math.max(0, pending.start - clock()));
        pending.delivered = true;
      } else animation.hide();
      return () => {
        if (listeners.get(key) === animation) listeners.delete(key);
      };
    },
    update(rows: readonly VisibleRow[]) {
      const now = clock();
      const ordered = rows
        .filter((row) => row.isViewable && row.index !== null)
        .slice()
        .sort((a, b) => a.index! - b.index!);
      const next = new Set(ordered.map((row) => row.key));
      for (const [key, pending] of visible) {
        if (next.has(key)) continue;
        // A quick flick can hide a row before its stagger starts. Cancel that
        // queued reveal, so it still gets its entrance when actually viewed.
        if (!pending.delivered || pending.start > now)
          listeners.get(key)?.hide();
        else {
          seen.add(key);
          listeners.get(key)?.finish();
        }
        visible.delete(key);
      }
      let rank = 0;
      for (const row of ordered) {
        if (visible.has(row.key)) continue;
        if (seen.has(row.key)) {
          visible.set(row.key, { start: now, delivered: true });
          listeners.get(row.key)?.finish();
          continue;
        }
        const delay = Math.min(rank++ * STAGGER_MS, MAX_DELAY_MS);
        const animation = listeners.get(row.key);
        visible.set(row.key, { start: now + delay, delivered: !!animation });
        animation?.reveal(delay);
      }
    },
  };
}

export type VisibleRowFade = ReturnType<typeof createVisibleRowFade>;
