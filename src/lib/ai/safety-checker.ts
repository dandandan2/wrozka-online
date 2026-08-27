export type FairyAnswerSafetyCategory = "medical" | "financial" | "legal";

export interface FairyAnswerSafetyVerdict {
  safe: boolean;
  category?: FairyAnswerSafetyCategory;
}

// JS's default \b/\w are ASCII-only, so a Polish word ending in a diacritic
// (e.g. "weź", "złóż") sits right at a \b that never fires. These helpers
// build word boundaries against \p{L}/\p{N} instead, so every pattern below
// must use the "u" flag.
const LEFT_BOUND = String.raw`(?<![\p{L}\p{N}_])`;
const RIGHT_BOUND = String.raw`(?![\p{L}\p{N}_])`;

function wordGroup(stems: string[]): string {
  return `${LEFT_BOUND}(?:${stems.join("|")})\\p{L}*`;
}

function word(stem: string): string {
  return `${LEFT_BOUND}${stem}\\p{L}*${RIGHT_BOUND}`;
}

// Concrete-recommendation patterns only — a bare topic mention (e.g. "zdrowie",
// "pieniądze") must never match on its own, since the fairy's whole premise is
// talking about life, money, and relationships in a magical register.
const MEDICAL_PATTERNS: RegExp[] = [
  new RegExp(
    `${wordGroup(["weź", "weźmi", "zaży", "przyjmij", "przyjmuj", "bierz"])}[^.!?\\n]{0,30}` +
      `(?:${LEFT_BOUND}\\d+\\s?(?:mg|ml|mcg|g)${RIGHT_BOUND}|${word("tabletk")}|${word("dawk")})`,
    "iu",
  ),
  new RegExp(
    wordGroup(["odstaw", "przestań brać", "zwiększ dawk", "zmniejsz dawk", "zmień dawkowani"]) + RIGHT_BOUND,
    "iu",
  ),
];

const FINANCIAL_PATTERNS: RegExp[] = [
  new RegExp(
    `${wordGroup(["kup", "sprzedaj", "zainwestuj"])}[^.!?\\n]{0,30}` +
      wordGroup(["akcj", "obligacj", "kryptowalut", "fundusz", "bitcoin", "ethereum"]) +
      RIGHT_BOUND,
    "iu",
  ),
  new RegExp(`${word("zaciągnij")}[^.!?\\n]{0,20}${wordGroup(["kredyt", "pożyczk"])}${RIGHT_BOUND}`, "iu"),
];

const LEGAL_PATTERNS: RegExp[] = [
  new RegExp(`${wordGroup(["podpisz", "zerwij"])}[^.!?\\n]{0,20}${word("umow")}`, "iu"),
  new RegExp(`${word("złóż")}[^.!?\\n]{0,20}${word("pozew")}`, "iu"),
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
