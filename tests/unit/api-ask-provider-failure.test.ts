import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";
import { stubOpenRouterFetch } from "../helpers/mock-openrouter-fetch";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: askHandler } = await import("@/pages/api/fairy/ask");

const SESSION_USER_ID = "session-user-ccc";
const GENERIC_ERROR_MESSAGE = "Wróżka nie mogła odpowiedzieć. Spróbuj ponownie.";

const PROFILE_RESPONSE = { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null };
const LIKED_ANSWERS_RESPONSE = { data: [], error: null };

describe("ask.ts AI-provider failure handling", () => {
  it("writes no fairy_responses row and redirects cleanly on a non-OK OpenRouter response", async () => {
    stubOpenRouterFetch("nonOk");
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_ANSWERS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    await askHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("writes no fairy_responses row and redirects cleanly when OpenRouter response is missing content", async () => {
    stubOpenRouterFetch("missingContent");
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_ANSWERS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    await askHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("writes no fairy_responses row and redirects cleanly when the OpenRouter request is aborted/times out", async () => {
    stubOpenRouterFetch("networkFailure");
    const { client, calls, consumedResponseCount } = createMockQueryClient([PROFILE_RESPONSE, LIKED_ANSWERS_RESPONSE]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    await askHandler(context as never);

    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(2);
  });

  it("redirects cleanly without throwing when the insert fails after a successful AI call", async () => {
    stubOpenRouterFetch("ok");
    const { client, consumedResponseCount } = createMockQueryClient([
      PROFILE_RESPONSE,
      LIKED_ANSWERS_RESPONSE,
      { data: null, error: { message: "insert failed" } },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "Czy będę szczęśliwy?" },
    });
    await expect(askHandler(context as never)).resolves.not.toThrow();

    expect(redirects[0]).toContain(encodeURIComponent(GENERIC_ERROR_MESSAGE));
    expect(consumedResponseCount()).toBe(3);
  });
});
