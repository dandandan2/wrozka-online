import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockAuthClient } from "../helpers/mock-supabase-auth";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: requestLinkHandler } = await import("@/pages/api/auth/request-link");

// This only proves request-link.ts reacts correctly to a simulated
// rate-limit error from Supabase Auth. It does NOT prove Supabase's real
// email_sent/max_frequency limits are actually configured or enabled
// anywhere — that requires a real Supabase instance (see plan.md's Open
// Risks: this environment has no Docker to run one).
describe("request-link.ts under a simulated rate-limit response", () => {
  it.each([
    ["over_email_send_rate_limit", "Too many attempts. Please wait a moment and try again."],
    ["over_request_rate_limit", "Too many attempts. Please wait a moment and try again."],
  ])("redirects cleanly with the mapped message when Supabase returns %s", async (code, expectedMessage) => {
    const authClient = createMockAuthClient({
      signInWithOtp: { data: null, error: { code, message: "rate limited by provider" } },
    });
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({ userId: null, formData: { email: "user@example.com" } });
    const response = await requestLinkHandler(context as never);

    expect(response.status).toBe(302);
    expect(redirects[0]).toContain("/auth/signin");
    expect(decodeURIComponent(redirects[0] ?? "")).toContain(expectedMessage);
  });
});
