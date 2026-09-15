import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient, eqArgsFor } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/tarot", () => ({ generateTarotReading: vi.fn(() => Promise.resolve("mock reading")) }));
vi.mock("@/lib/tarot/cards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tarot/cards")>();
  return {
    ...actual,
    drawCard: vi.fn(() => ({ card: actual.MAJOR_ARCANA[0], orientation: "upright" as const })),
  };
});

const { createClient } = await import("@/lib/supabase");
const { POST: drawHandler } = await import("@/pages/api/tarot/draw");
const { POST: likeHandler } = await import("@/pages/api/tarot/like");
const { POST: deleteHandler } = await import("@/pages/api/tarot/delete");

const SESSION_USER_ID = "session-user-bbb";
const OTHER_RESOURCE_ID = "resource-owned-by-someone-else";

describe("draw.ts ownership filtering", () => {
  it("filters the profile lookup, liked-readings lookup, and insert all by locals.user.id", async () => {
    const { client, calls, consumedResponseCount } = createMockQueryClient([
      { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null },
      { data: [], error: null },
      { data: { id: "new-reading-id" }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    expect(eqArgsFor(calls, "id")).toEqual([SESSION_USER_ID]);
    expect(eqArgsFor(calls, "user_id")).toEqual([SESSION_USER_ID]);

    const insertCall = calls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ user_id: SESSION_USER_ID, card_key: "the-fool", orientation: "upright" });

    expect(consumedResponseCount()).toBe(3);
  });

  it("accepts an empty question as valid (question is optional)", async () => {
    const { client, calls } = createMockQueryClient([
      { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null },
      { data: [], error: null },
      { data: { id: "new-reading-id" }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    const insertCall = calls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ question: null });
    expect(redirects[0]).toContain("reading=new-reading-id");
  });
});

describe("like.ts ownership filtering", () => {
  it("filters both the select and the update by locals.user.id, never a request-supplied value alone", async () => {
    const { client, calls, consumedResponseCount } = createMockQueryClient([
      { data: { liked: false }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: OTHER_RESOURCE_ID },
    });
    await likeHandler(context as never);

    expect(eqArgsFor(calls, "user_id")).toEqual([SESSION_USER_ID, SESSION_USER_ID]);
    expect(eqArgsFor(calls, "id")).toEqual([OTHER_RESOURCE_ID, OTHER_RESOURCE_ID]);
    expect(consumedResponseCount()).toBe(2);
  });
});

describe("delete.ts ownership filtering", () => {
  it("filters the delete by locals.user.id, never a request-supplied value alone", async () => {
    const { client, calls, consumedResponseCount } = createMockQueryClient([{ data: null, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: OTHER_RESOURCE_ID },
    });
    await deleteHandler(context as never);

    expect(eqArgsFor(calls, "user_id")).toEqual([SESSION_USER_ID]);
    expect(eqArgsFor(calls, "id")).toEqual([OTHER_RESOURCE_ID]);
    expect(consumedResponseCount()).toBe(1);
  });
});
