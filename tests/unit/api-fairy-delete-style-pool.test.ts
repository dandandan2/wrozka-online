import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient, eqArgsFor } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/fairy", () => ({ generateFairyAnswer: vi.fn(() => Promise.resolve("mock answer")) }));

const { createClient } = await import("@/lib/supabase");
const { generateFairyAnswer } = await import("@/lib/ai/fairy");
const { POST: askHandler } = await import("@/pages/api/fairy/ask");

const SESSION_USER_ID = "session-user-ddd";

// Represents the content of a fairy_responses row that has already been
// deleted — it is deliberately absent from the liked-answers fixture below,
// standing in for "if this were still liked/undeleted, it would appear here."
const DELETED_ANSWER_SENTINEL = "DELETED_ANSWER_SENTINEL";
const SURVIVING_ANSWERS = ["Gwiazdy mówią o nowych początkach.", "Twoja intuicja Cię nie zawiedzie."];

describe("ask.ts liked-answers style pool excludes deleted entries", () => {
  it("queries with the liked=true filter and never passes a deleted answer's content to generateFairyAnswer", async () => {
    const { client, calls } = createMockQueryClient([
      { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null },
      { data: SURVIVING_ANSWERS.map((answer) => ({ answer })), error: null },
      { data: { id: "new-response-id" }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    await askHandler(context as never);

    expect(eqArgsFor(calls, "liked")).toEqual([true]);

    const likedAnswersArg = vi.mocked(generateFairyAnswer).mock.calls[0]?.[2];
    expect(likedAnswersArg).not.toContain(DELETED_ANSWER_SENTINEL);
    expect(likedAnswersArg).toEqual(SURVIVING_ANSWERS);
  });
});
