import { useEffect, useRef, useState } from "react";

import { MarkdownMessage } from "./markdown-message";

const CARET = "▍";

/**
 * Characters revealed per frame. Short answers type at a readable pace; long
 * ones speed up so no reveal takes more than a couple of seconds.
 */
export function typewriterStep(remaining: number) {
  return Math.min(10, Math.max(1, Math.ceil(remaining / 40)));
}

/**
 * Reveals `text` like typing, whether the model streamed it token by token or
 * returned it all at once. `text` may keep growing while streaming; the reveal
 * follows it. `onDone` fires once the full, final text is visible.
 */
export function TypewriterMarkdown({
  text,
  animate,
  final,
  onDone,
}: {
  text: string;
  animate: boolean;
  /** False while the model is still streaming more text. */
  final: boolean;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(animate ? 0 : text.length);
  const shownRef = useRef(shown);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const tick = () => {
      const current = shownRef.current;
      if (current >= text.length) {
        if (final) doneRef.current?.();
        return;
      }
      const next = Math.min(
        text.length,
        current + typewriterStep(text.length - current),
      );
      shownRef.current = next;
      setShown(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, final, text]);

  // Finished or restored answers render in full without replaying the reveal.
  const typing = animate && (shown < text.length || !final);
  return (
    <MarkdownMessage
      text={typing ? `${text.slice(0, shown)}${CARET}` : text}
    />
  );
}
