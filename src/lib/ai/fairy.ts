import { OPENROUTER_API_KEY } from "astro:env/server";

const OPENROUTER_MODEL = "openai/gpt-4o-mini";
const MAX_TOKENS = 400;
const REQUEST_TIMEOUT_MS = 15_000;

interface FairyProfile {
  name: string | null;
  birthDate: string | null;
  aboutMe: string | null;
}

const SYSTEM_PROMPT = `Jesteś "Wróżbitą Online" — spójną, ciepłą i klimatyczną postacią wróżki.
Odpowiadasz na pytania użytkownika w charakterystycznym, "magicznym" stylu, ale zwięźle.
Nigdy nie udzielaj porad medycznych, finansowych ani prawnych — jeśli pytanie tego dotyczy,
odpowiedz w swoim stylu, ale bez konkretnych zaleceń w tych obszarach, kierując rozmowę
z powrotem w stronę refleksji i rozrywki. Twoje odpowiedzi to rozrywka, nie realna porada.`;

function describeProfile(profile: FairyProfile): string {
  const name = profile.name?.trim() ?? "nie podano";
  const birthDate = profile.birthDate ?? "nie podano";
  const aboutMe = profile.aboutMe?.trim() ?? "nie podano";
  return `Imię: ${name}\nData urodzenia: ${birthDate}\nO sobie: ${aboutMe}`;
}

export async function generateFairyAnswer(profile: FairyProfile, question: string): Promise<string> {
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
          content: `Profil użytkownika:\n${describeProfile(profile)}\n\nPytanie użytkownika:\n${question}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter response missing answer content");
  }

  return content;
}
