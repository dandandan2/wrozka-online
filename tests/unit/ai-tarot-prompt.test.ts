import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTarotReading } from "@/lib/ai/tarot";
import { MAJOR_ARCANA } from "@/lib/tarot/cards";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchCapturingBody(answer = "mock reading") {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PROFILE = { name: "Ala", birthDate: "1990-01-01", aboutMe: "Lubię koty" };
const CARD = MAJOR_ARCANA.find((card) => card.key === "the-fool")!;

describe("generateTarotReading prompt construction", () => {
  it("includes the drawn card's name, orientation, and keywords in the request", async () => {
    const fetchMock = stubFetchCapturingBody();

    await generateTarotReading(PROFILE, CARD, "reversed", null);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user").content as string;

    expect(userMessage).toContain(CARD.name);
    expect(userMessage).toContain("odwrócona");
    for (const keyword of CARD.keywords) {
      expect(userMessage).toContain(keyword);
    }
  });

  it("includes profile fields in the request", async () => {
    const fetchMock = stubFetchCapturingBody();

    await generateTarotReading(PROFILE, CARD, "upright", null);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const userMessage = body.messages.find((m: { role: string }) => m.role === "user").content as string;

    expect(userMessage).toContain(PROFILE.name);
    expect(userMessage).toContain(PROFILE.birthDate);
    expect(userMessage).toContain(PROFILE.aboutMe);
  });

  it("includes the question when provided, and omits a question section when null", async () => {
    const withQuestion = stubFetchCapturingBody();
    await generateTarotReading(PROFILE, CARD, "upright", "Czy czeka mnie zmiana?");
    const bodyWith = JSON.parse(withQuestion.mock.calls[0][1].body as string);
    const contentWith = bodyWith.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(contentWith).toContain("Czy czeka mnie zmiana?");

    vi.unstubAllGlobals();
    const withoutQuestion = stubFetchCapturingBody();
    await generateTarotReading(PROFILE, CARD, "upright", null);
    const bodyWithout = JSON.parse(withoutQuestion.mock.calls[0][1].body as string);
    const contentWithout = bodyWithout.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(contentWithout).not.toContain("Pytanie użytkownika");
  });

  it("returns the generated content on a successful call", async () => {
    stubFetchCapturingBody("Karta mówi o nowych początkach.");
    const result = await generateTarotReading(PROFILE, CARD, "upright", null);
    expect(result).toBe("Karta mówi o nowych początkach.");
  });
});
