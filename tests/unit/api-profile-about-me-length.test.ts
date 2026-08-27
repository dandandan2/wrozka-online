import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: updateHandler } = await import("@/pages/api/profile/update");

const SESSION_USER_ID = "session-user-eee";
const ABOUT_ME_MAX_LENGTH = 500;
const LENGTH_ERROR_MESSAGE = `"O sobie" może mieć maksymalnie ${ABOUT_ME_MAX_LENGTH} znaków.`;

describe("profile/update.ts about_me length boundary", () => {
  it("accepts about_me at exactly the 500-character limit", async () => {
    const { client, calls } = createMockQueryClient([{ data: null, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: {
        name: "Ala",
        birth_date: "1990-01-01",
        about_me: "a".repeat(ABOUT_ME_MAX_LENGTH),
      },
    });
    await updateHandler(context as never);

    expect(calls.some((call) => call.method === "update")).toBe(true);
    expect(redirects[0]).not.toContain(encodeURIComponent(LENGTH_ERROR_MESSAGE));
  });

  it("rejects about_me one character over the limit, never calling update", async () => {
    const { client, calls } = createMockQueryClient([{ data: null, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context, redirects } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: {
        name: "Ala",
        birth_date: "1990-01-01",
        about_me: "a".repeat(ABOUT_ME_MAX_LENGTH + 1),
      },
    });
    await updateHandler(context as never);

    expect(calls.some((call) => call.method === "update")).toBe(false);
    expect(redirects[0]).toContain(encodeURIComponent(LENGTH_ERROR_MESSAGE));
  });
});
