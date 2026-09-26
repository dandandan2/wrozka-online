import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/tarot", () => ({ generateTarotReading: vi.fn() }));
vi.mock("@/lib/tarot/cards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tarot/cards")>();
  return {
    ...actual,
    drawCard: vi.fn(() => ({ card: actual.MAJOR_ARCANA[0], orientation: "upright" as const })),
  };
});

const { createClient } = await import("@/lib/supabase");
const { generateTarotReading } = await import("@/lib/ai/tarot");
const { POST: drawHandler } = await import("@/pages/api/tarot/draw");

const UNSAFE_ANSWER = "Zażyj dwie tabletki przed snem, to pomoże.";
const BENIGN_ANSWER = "Karta mówi o nowych początkach i odwadze do zmian.";

const SESSION_USER_ID = "session-user-ggg";
const GENERIC_ERROR_MESSAGE = "Karty nie chciały dziś przemówić. Spróbuj ponownie.";

const PROFILE_RESPONSE = { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null };
const LIKED_ANSWERS_RESPONSE = { data: [], error: null };

describe("draw.ts safety-check integration", () => {
  it("discards a flagged reading, writes no tarot_readings row, and redirects cleanly", async () => {
    vi.mocked(generateTarotReading).mockResolvedValueOnce(UNSAFE_ANSWER);
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_ANSWERS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("persists and redirects normally when the reading is benign", async () => {
    vi.mocked(generateTarotReading).mockResolvedValueOnce(BENIGN_ANSWER);
    const { client, calls, consumedResponseCount } = createMockQueryClient([
      PROFILE_RESPONSE,
      LIKED_ANSWERS_RESPONSE,
      { data: { id: "new-reading-id" }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    const insertCall = calls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ answer: BENIGN_ANSWER });
    expect(redirects[0]).toContain("reading=new-reading-id");
    expect(consumedResponseCount()).toBe(3);
  });
});
