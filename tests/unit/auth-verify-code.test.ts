import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockAuthClient } from "../helpers/mock-supabase-auth";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: verifyCodeHandler } = await import("@/pages/api/auth/verify-code");

describe("verify-code.ts", () => {
  it("calls verifyOtp with email/token/type email, then redirects home on success", async () => {
    const authClient = createMockAuthClient();
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({
      userId: null,
      formData: { email: "user@example.com", code: "123456" },
    });
    await verifyCodeHandler(context as never);

    expect(authClient.auth.verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "email",
    });
    expect(redirects[0]).toBe("/");
  });

  it("redirects to confirm-email with the mapped error message on an invalid code", async () => {
    const authClient = createMockAuthClient({
      verifyOtp: { data: null, error: { code: "invalid_credentials", message: "bad code" } },
    });
    vi.mocked(createClient).mockReturnValue(authClient as never);

    const { context, redirects } = createFakeContext({
      userId: null,
      formData: { email: "user@example.com", code: "000000" },
    });
    await verifyCodeHandler(context as never);

    expect(redirects[0]).toContain("/auth/confirm-email");
    expect(decodeURIComponent(redirects[0] ?? "")).toContain("That code is invalid");
  });
});
