export type TextDirection = "ltr" | "rtl";

// Hebrew, Arabic, Syriac, Thaana, NKo and their presentation forms.
const RTL_LETTER =
  /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿߀-߿ࢠ-ࣿיִ-﷿ﹰ-﻿]/g;
const LTR_LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g;

/**
 * Direction of a piece of model output, decided by its own letters rather than
 * the app language. Majority wins so a Hebrew sentence that opens with an
 * English merchant name or "EUR" still reads right-to-left. Text without
 * letters (numbers, symbols) returns the fallback.
 */
export function detectDirection(
  text: string,
  fallback: TextDirection = "ltr",
): TextDirection {
  const rtl = text.match(RTL_LETTER)?.length ?? 0;
  const ltr = text.match(LTR_LETTER)?.length ?? 0;
  if (!rtl && !ltr) return fallback;
  return rtl >= ltr ? "rtl" : "ltr";
}

/** Named for the prompt so a small model answers in the question's language. */
export function detectLanguageName(text: string) {
  if (/[֐-׿]/.test(text)) return "Hebrew";
  if (/[؀-ۿ]/.test(text)) return "Arabic";
  if (/[Ѐ-ӿ]/.test(text)) return "Russian";
  if (/[A-Za-z]/.test(text)) return "English";
  return null;
}
