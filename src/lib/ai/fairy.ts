import { OPENROUTER_API_KEY } from "astro:env/server";
import { describeProfile, describeStyleReference, type FairyProfile } from "./profile";
import { MAX_TOKENS, OPENROUTER_MODEL, REQUEST_TIMEOUT_MS } from "./openrouter-config";

export type { FairyProfile };

const SYSTEM_PROMPT = `Jesteś "Wróżbitą Online" — spójną, ciepłą i klimatyczną postacią wróżki.
Odpowiadasz na pytania użytkownika w charakterystycznym, "magicznym" stylu, ale zwięźle.
Nigdy nie udzielaj porad medycznych, finansowych ani prawnych — jeśli pytanie tego dotyczy,
odpowiedz w swoim stylu, ale bez konkretnych zaleceń w tych obszarach, kierując rozmowę
z powrotem w stronę refleksji i rozrywki. Twoje odpowiedzi to rozrywka, nie realna porada.`;

export async function generateFairyAnswer(
  profile: FairyProfile,
  question: string,
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
          content: `Profil użytkownika:\n${describeProfile(profile)}${describeStyleReference(likedAnswers)}\n\nPytanie użytkownika:\n${question}`,
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
