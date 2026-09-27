/**
 * Every data-dependent answer is grounded in an EvidenceBundle built by
 * trusted tools. The model receives the bundle's text; the structured facts
 * stay in the app for cards, ranking and the development audit below.
 */

export interface FactRef {
  factId: string;
  tool: string;
  entityType?: string;
  entityId?: string;
  period?: { start: string; end: string; label: string };
  currency?: string;
  computedAt: string;
  /** stored = saved in a record; calculated = deterministic math; projection = forecast. */
  kind: "stored" | "calculated" | "projection";
}

export type EvidenceValue = string | number | boolean | null;

export interface EvidenceFact {
  ref: FactRef;
  value: EvidenceValue;
}

export interface EvidenceBundle {
  question: string;
  profileId: string;
  reportingCurrency: string;
  generatedAt: string;
  tools: string[];
  facts: EvidenceFact[];
  warnings: string[];
  missingData: string[];
  assumptions: string[];
  /** The compact text the model reads. */
  text: string;
}

/** Amount-like tokens: 1,234.56 / 1234 / 12.5% / -40 */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/g;

function numbersIn(text: string) {
  const values: number[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const value = Number(match[0].replace(/,/g, ""));
    if (Number.isFinite(value)) values.push(Math.abs(value));
  }
  return values;
}

export type EvidenceAudit = {
  /** Numbers in the answer that no evidence value supports. */
  unsupported: number[];
  checked: number;
};

/**
 * Development-time check: flags numbers in an answer that are neither in the
 * evidence nor a rounding of an evidence number. Small integers (list
 * numbering, "3 budgets") and years are skipped. This is an evaluation aid,
 * not product truth.
 */
export function auditAnswerNumbers(
  answer: string,
  evidence: Pick<EvidenceBundle, "text" | "facts">,
): EvidenceAudit {
  const known = [
    ...numbersIn(evidence.text),
    ...evidence.facts.flatMap((fact) =>
      typeof fact.value === "number" ? [Math.abs(fact.value)] : [],
    ),
  ];
  const supported = (value: number) =>
    known.some(
      (candidate) =>
        Math.abs(candidate - value) <= Math.max(0.51, candidate * 0.005) ||
        // Rounded to thousands ("about 4k") or whole percent.
        Math.round(candidate) === Math.round(value),
    );
  const unsupported: number[] = [];
  let checked = 0;
  for (const value of numbersIn(answer)) {
    if (value <= 31 && Number.isInteger(value)) continue;
    if (value >= 1990 && value <= 2100 && Number.isInteger(value)) continue;
    checked++;
    if (!supported(value)) unsupported.push(value);
  }
  return { unsupported, checked };
}
