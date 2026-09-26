import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: fairyLikeHandler } = await import("@/pages/api/fairy/like");
const { POST: tarotLikeHandler } = await import("@/pages/api/tarot/like");

const SESSION_USER_ID = "session-user-jjj";
const ENTRY_ID = "entry-abc";

/**
 * Both like handlers read the current `liked` value and write its negation, so
 * the button is a toggle rather than a one-way "like". The existing ownership
 * and redirect tests only assert *that* an update ran and where it redirected —
 * dropping the `!` (turning unlike into a no-op) would leave every one of them
 * green. Pin the written payload instead.
 *
 * `liked` also feeds the style pool the AI prompt is built from
 * (`.eq("liked", true)` in ask.ts/draw.ts), so a broken unlike silently keeps
 * rejected answers shaping future readings.
 */
describe.each([
  ["fairy_responses", fairyLikeHandler],
  ["tarot_readings", tarotLikeHandler],
] as const)("%s like toggle", (table, likeHandler) => {
  it("writes liked: true when the entry is currently unliked", async () => {
    const { client, calls } = createMockQueryClient([
      { data: { liked: false }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: ENTRY_ID } });
    await likeHandler(context as never);

    const updateCall = calls.find((call) => call.method === "update");
    expect(updateCall?.args[0]).toEqual({ liked: true });
    expect(calls.filter((call) => call.method === "from").map((call) => call.args[0])).toEqual([table, table]);
  });

  it("writes liked: false when the entry is currently liked", async () => {
    const { client, calls } = createMockQueryClient([
      { data: { liked: true }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: ENTRY_ID } });
    await likeHandler(context as never);

    const updateCall = calls.find((call) => call.method === "update");
    expect(updateCall?.args[0]).toEqual({ liked: false });
  });

  it("never updates when the entry lookup fails, so a foreign or missing id cannot be toggled", async () => {
    const { client, calls } = createMockQueryClient([{ data: null, error: { message: "not found" } }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: ENTRY_ID } });
    await likeHandler(context as never);

    expect(calls.some((call) => call.method === "update")).toBe(false);
  });
});
