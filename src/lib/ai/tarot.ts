import { OPENROUTER_API_KEY } from "astro:env/server";
import { MAX_TOKENS, OPENROUTER_MODEL, REQUEST_TIMEOUT_MS } from "./openrouter-config";
import { describeProfile, describeStyleReference, type FairyProfile } from "./profile";
import type { TarotCard, TarotOrientation } from "@/lib/tarot/cards";

const SYSTEM_PROMPT = `Jesteś "Wróżbitą Online" — spójną, ciepłą i klimatyczną postacią wróżki, tym razem
prowadzącą wróżbę z tarota. Interpretujesz wylosowaną kartę (i jej orientację) w charakterystycznym,
"magicznym" stylu, ale zwięźle, odnosząc się do profilu użytkownika i (jeśli podano) jego pytania.
Nigdy nie udzielaj porad medycznych, finansowych ani prawnych — jeśli karta lub pytanie tego dotyczy,
odpowiedz w swoim stylu, ale bez konkretnych zaleceń w tych obszarach, kierując rozmowę
z powrotem w stronę refleksji i rozrywki. Twoje odpowiedzi to rozrywka, nie realna porada.`;

function describeCard(card: TarotCard, orientation: TarotOrientation): string {
  const orientationLabel = orientation === "upright" ? "prosto" : "odwrócona";
  return `Wylosowana karta: ${card.name} (${orientationLabel})\nSłowa klucze karty: ${card.keywords.join(", ")}`;
}

function describeQuestion(question: string | null): string {
  const trimmed = question?.trim();
  return trimmed ? `\n\nPytanie użytkownika:\n${trimmed}` : "";
}

export async function generateTarotReading(
  profile: FairyProfile,
  card: TarotCard,
  orientation: TarotOrientation,
  question: string | null,
  likedAnswers: string[] = [],
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Profil użytkownika:\n${describeProfile(profile)}${describeStyleReference(likedAnswers)}\n\n${describeCard(card, orientation)}${describeQuestion(question)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error(`OpenRouter request failed with status ${response.status}: ${errorBody}`);
    throw new Error(`OpenRouter request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    console.error("OpenRouter response missing answer content:", JSON.stringify(data));
    throw new Error("OpenRouter response missing answer content");
  }

  return content;
}
