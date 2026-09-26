import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";
import { stubOpenRouterFetch } from "../helpers/mock-openrouter-fetch";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tarot/cards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tarot/cards")>();
  return {
    ...actual,
    drawCard: vi.fn(() => ({ card: actual.MAJOR_ARCANA[0], orientation: "upright" as const })),
  };
});

const { createClient } = await import("@/lib/supabase");
const { POST: drawHandler } = await import("@/pages/api/tarot/draw");

const SESSION_USER_ID = "session-user-hhh";
const GENERIC_ERROR_MESSAGE = "Karty nie chciały dziś przemówić. Spróbuj ponownie.";

const PROFILE_RESPONSE = { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null };
const LIKED_READINGS_RESPONSE = { data: [], error: null };

describe("draw.ts AI-provider failure handling", () => {
  it("writes no tarot_readings row and redirects cleanly on a non-OK OpenRouter response", async () => {
    stubOpenRouterFetch("nonOk");
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_READINGS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("writes no tarot_readings row and redirects cleanly when OpenRouter response is missing content", async () => {
    stubOpenRouterFetch("missingContent");
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_READINGS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("writes no tarot_readings row and redirects cleanly when the OpenRouter request is aborted/times out", async () => {
    stubOpenRouterFetch("networkFailure");
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_READINGS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await drawHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("redirects cleanly without throwing when the insert fails after a successful AI call", async () => {
    stubOpenRouterFetch("ok");
    const { client, consumedResponseCount } = createMockQueryClient([
      PROFILE_RESPONSE,
      LIKED_READINGS_RESPONSE,
      { data: null, error: { message: "insert failed" } },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    await expect(drawHandler(context as never)).resolves.not.toThrow();

    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(3);
  });
});
