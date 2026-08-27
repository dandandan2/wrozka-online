import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockAuthClient } from "../helpers/mock-supabase-auth";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { GET: callbackHandler } = await import("@/pages/api/auth/callback");

describe("callback.ts", () => {
  it("calls exchangeCodeForSession with the code query param, then redirects home on success", async () => {
    const authClient = createMockAuthClient();
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({
      userId: null,
      url: "http://localhost/api/auth/callback?code=abc123",
    });
    await callbackHandler(context as never);

    expect(authClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(redirects[0]).toBe("/");
  });

  it("redirects to signin with an error and never calls exchangeCodeForSession when the code is missing", async () => {
    const authClient = createMockAuthClient();
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({ userId: null, url: "http://localhost/api/auth/callback" });
    await callbackHandler(context as never);

    expect(authClient.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(redirects[0]).toContain("/auth/signin");
  });

  it("redirects to signin with the mapped error message when the exchange fails", async () => {
    const authClient = createMockAuthClient({
      exchangeCodeForSession: { data: null, error: { code: "otp_expired", message: "expired" } },
    });
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({
      userId: null,
      url: "http://localhost/api/auth/callback?code=stale",
    });
    await callbackHandler(context as never);

    expect(redirects[0]).toContain("/auth/signin");
    expect(decodeURIComponent(redirects[0] ?? "")).toContain("expired");
  });
});
