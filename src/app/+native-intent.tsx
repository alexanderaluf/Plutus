import { CHATGPT_RETURN_PATH } from "@/features/local-ai/chatgpt-protocol";

const CHATGPT_RETURN = new RegExp(`(^|://|/)${CHATGPT_RETURN_PATH}(?=$|[/?#])`);

/**
 * The ChatGPT sign-in page opens this link only to bring Plutus back to the
 * foreground; the running sign-in finishes on the screen that started it.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (CHATGPT_RETURN.test(path)) return initial ? "/" : null;
  } catch {
    // Fall through to normal routing.
  }
  return path;
}
