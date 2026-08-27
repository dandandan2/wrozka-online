import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockAuthClient } from "../helpers/mock-supabase-auth";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: requestLinkHandler } = await import("@/pages/api/auth/request-link");

describe("request-link.ts", () => {
  it("calls signInWithOtp with the submitted email and the callback redirect URL, then redirects to confirm-email", async () => {
    const authClient = createMockAuthClient();
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({
      userId: null,
      formData: { email: "user@example.com" },
      url: "http://localhost/api/auth/request-link",
    });
    await requestLinkHandler(context as never);

    expect(authClient.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: {
        emailRedirectTo: "http://localhost/api/auth/callback",
        shouldCreateUser: true,
      },
    });
    expect(redirects[0]).toContain("/auth/confirm-email");
  });

  it("redirects to signin with the mapped error message when Supabase returns an error", async () => {
    const authClient = createMockAuthClient({
      signInWithOtp: { data: null, error: { code: "over_email_send_rate_limit", message: "rate limited" } },
    });
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({ userId: null, formData: { email: "user@example.com" } });
    await requestLinkHandler(context as never);

    expect(redirects[0]).toContain("/auth/signin");
    expect(decodeURIComponent(redirects[0] ?? "")).toContain("Too many attempts");
  });
});
