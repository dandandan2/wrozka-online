import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient, eqArgsFor } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/fairy", () => ({ generateFairyAnswer: vi.fn(() => Promise.resolve("mock answer")) }));

const { createClient } = await import("@/lib/supabase");
const { POST: askHandler } = await import("@/pages/api/fairy/ask");
const { POST: likeHandler } = await import("@/pages/api/fairy/like");
const { POST: deleteHandler } = await import("@/pages/api/fairy/delete");

const SESSION_USER_ID = "session-user-aaa";
const OTHER_RESOURCE_ID = "resource-owned-by-someone-else";

describe("ask.ts ownership filtering", () => {
  it("filters the profile lookup, liked-answers lookup, and insert all by locals.user.id", async () => {
    const { client, calls, consumedResponseCount } = createMockQueryClient([
      { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null },
      { data: [], error: null },
      { data: { id: "new-response-id" }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    await askHandler(context as never);

    expect(eqArgsFor(calls, "id")).toEqual([SESSION_USER_ID]);
    expect(eqArgsFor(calls, "user_id")).toEqual([SESSION_USER_ID]);

    const insertCall = calls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ user_id: SESSION_USER_ID });

    // Catches both a missing and an extra/unaccounted-for Supabase call.
    expect(consumedResponseCount()).toBe(3);
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
