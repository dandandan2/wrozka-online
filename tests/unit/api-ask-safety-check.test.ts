import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/fairy", () => ({ generateFairyAnswer: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { generateFairyAnswer } = await import("@/lib/ai/fairy");
const { POST: askHandler } = await import("@/pages/api/fairy/ask");

const UNSAFE_ANSWER = "Zażyj dwie tabletki przed snem, to pomoże.";
const BENIGN_ANSWER = "Gwiazdy mówią, że czeka Cię wielka zmiana w życiu zawodowym.";

const SESSION_USER_ID = "session-user-fff";
const GENERIC_ERROR_MESSAGE = "Wróżka nie mogła odpowiedzieć. Spróbuj ponownie.";

// The page that actually renders AskForm's serverError / the answer card.
const ERROR_TARGET = `/dashboard/fairy?error=${encodeURIComponent(GENERIC_ERROR_MESSAGE)}`;

const PROFILE_RESPONSE = { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null };
const LIKED_ANSWERS_RESPONSE = { data: [], error: null };

describe("ask.ts safety-check integration", () => {
  it("discards a flagged answer, writes no fairy_responses row, and redirects to the fairy page", async () => {
    vi.mocked(generateFairyAnswer).mockResolvedValueOnce(UNSAFE_ANSWER);
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_ANSWERS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Boli mnie głowa, co robić?" },
    });
    const response = await askHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(response.headers.get("Location")).toBe(ERROR_TARGET);
    expect(redirects).toEqual([ERROR_TARGET]);
    expect(consumedResponseCount()).toBe(2);
  });

  it("persists and redirects to the fairy page with the new response id when the answer is benign", async () => {
    vi.mocked(generateFairyAnswer).mockResolvedValueOnce(BENIGN_ANSWER);
    const { client, calls, consumedResponseCount } = createMockQueryClient([
      PROFILE_RESPONSE,
      LIKED_ANSWERS_RESPONSE,
      { data: { id: "new-response-id" }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    const response = await askHandler(context as never);

    const insertCall = calls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ answer: BENIGN_ANSWER });
    expect(response.headers.get("Location")).toBe("/dashboard/fairy?response=new-response-id");
    expect(redirects).toEqual(["/dashboard/fairy?response=new-response-id"]);
    expect(consumedResponseCount()).toBe(3);
  });
});
