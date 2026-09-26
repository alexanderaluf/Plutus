import { createContext, useContext, type ReactNode } from "react";

/** Resolves @references in an answer to live record cards and names. */
export type MentionResolver = {
  card: (ref: string) => ReactNode | null;
  label: (ref: string) => string | null;
  press: (ref: string) => void;
};

export const MentionContext = createContext<MentionResolver | null>(null);

export function useMentions() {
  return useContext(MentionContext);
}
