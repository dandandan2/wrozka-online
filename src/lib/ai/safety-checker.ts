export type FairyAnswerSafetyCategory = "medical" | "financial" | "legal";

export interface FairyAnswerSafetyVerdict {
  safe: boolean;
  category?: FairyAnswerSafetyCategory;
}

// Concrete-recommendation patterns only — a bare topic mention (e.g. "zdrowie",
// "pieniądze") must never match on its own, since the fairy's whole premise is
// talking about life, money, and relationships in a magical register.
const MEDICAL_PATTERNS: RegExp[] = [
  /\b(weź|zażyj|przyjmij|bierz)\b[^.!?\n]{0,30}\b(\d+\s?(mg|ml|mcg|g)\b|tabletk\w*|dawk\w*)/i,
  /\b(odstaw|przestań brać|zwiększ dawkę|zmniejsz dawkę|zmień dawkowanie)\b/i,
];

const FINANCIAL_PATTERNS: RegExp[] = [
  /\b(kup|sprzedaj|zainwestuj)\b[^.!?\n]{0,30}\b(akcj\w*|obligacj\w*|kryptowalut\w*|fundusz\w*|bitcoin\w*|ethereum\w*)/i,
  /\bzaci[ąa]gnij\b[^.!?\n]{0,20}\b(kredyt\w*|pożyczk\w*)/i,
];

const LEGAL_PATTERNS: RegExp[] = [
  /\b(podpisz|zerwij)\b[^.!?\n]{0,20}\bumow\w*/i,
  /\bzłóż\b[^.!?\n]{0,20}\bpozew\b/i,
  /\bart\.\s?\d+/i,
  /§\s?\d+/,
];

const CATEGORY_PATTERNS: [FairyAnswerSafetyCategory, RegExp[]][] = [
  ["medical", MEDICAL_PATTERNS],
  ["financial", FINANCIAL_PATTERNS],
  ["legal", LEGAL_PATTERNS],
];

/**
 * Deterministic, pattern-based defense-in-depth check on a generated fairy
 * answer — flags concrete medical/financial/legal recommendations, the same
 * three categories the system prompt (see fairy.ts's SYSTEM_PROMPT) already
 * instructs the model to avoid. Keyword matching cannot catch every
 * cleverly-phrased recommendation; this is a backstop alongside the prompt
 * instruction, not a replacement for it.
 */
export function checkFairyAnswerSafety(answer: string): FairyAnswerSafetyVerdict {
  for (const [category, patterns] of CATEGORY_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(answer))) {
      return { safe: false, category };
    }
  }
  return { safe: true };
}
