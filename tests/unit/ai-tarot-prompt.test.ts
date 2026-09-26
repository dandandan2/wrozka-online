import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTarotReading } from "@/lib/ai/tarot";
import { MAJOR_ARCANA } from "@/lib/tarot/cards";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface OpenRouterRequestBody {
  messages: { role: string; content: string }[];
}

function stubFetchCapturingBody(answer = "mock reading") {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function userMessageFrom(fetchMock: ReturnType<typeof stubFetchCapturingBody>): string {
  const call = fetchMock.mock.calls[0];
  const body = JSON.parse(call[1].body as string) as OpenRouterRequestBody;
  const userMessage = body.messages.find((m) => m.role === "user");
  if (!userMessage) throw new Error("expected a user message in the request body");
  return userMessage.content;
}

const PROFILE = { name: "Ala", birthDate: "1990-01-01", aboutMe: "Lubię koty" };
const CARD = MAJOR_ARCANA.find((card) => card.key === "the-fool");
if (!CARD) throw new Error("expected 'the-fool' to be present in MAJOR_ARCANA");

describe("generateTarotReading prompt construction", () => {
  it("includes the drawn card's name, orientation, and keywords in the request", async () => {
    const fetchMock = stubFetchCapturingBody();

    await generateTarotReading(PROFILE, CARD, "reversed", null);

    const userMessage = userMessageFrom(fetchMock);
    expect(userMessage).toContain(CARD.name);
    expect(userMessage).toContain("odwrócona");
    for (const keyword of CARD.keywords) {
      expect(userMessage).toContain(keyword);
    }
  });

  it("includes profile fields in the request", async () => {
    const fetchMock = stubFetchCapturingBody();

    await generateTarotReading(PROFILE, CARD, "upright", null);

    const userMessage = userMessageFrom(fetchMock);
    expect(userMessage).toContain(PROFILE.name);
    expect(userMessage).toContain(PROFILE.birthDate);
    expect(userMessage).toContain(PROFILE.aboutMe);
  });

  it("includes the question when provided, and omits a question section when null", async () => {
    const withQuestion = stubFetchCapturingBody();
    await generateTarotReading(PROFILE, CARD, "upright", "Czy czeka mnie zmiana?");
    expect(userMessageFrom(withQuestion)).toContain("Czy czeka mnie zmiana?");

    vi.unstubAllGlobals();
    const withoutQuestion = stubFetchCapturingBody();
    await generateTarotReading(PROFILE, CARD, "upright", null);
    expect(userMessageFrom(withoutQuestion)).not.toContain("Pytanie użytkownika");
  });

  it("returns the generated content on a successful call", async () => {
    stubFetchCapturingBody("Karta mówi o nowych początkach.");
    const result = await generateTarotReading(PROFILE, CARD, "upright", null);
    expect(result).toBe("Karta mówi o nowych początkach.");
  });
});
