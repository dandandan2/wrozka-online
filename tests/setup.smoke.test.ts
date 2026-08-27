import { describe, expect, it } from "vitest";
import { toAuthErrorMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

describe("test toolchain bootstrap", () => {
  it("resolves the @/* alias to src/", () => {
    expect(toAuthErrorMessage({ code: "otp_expired", message: "expired" })).toBe(
      "That link or code has expired. Request a new one.",
    );
  });

  it("resolves astro:env/server through src/lib/supabase.ts without throwing", () => {
    expect(() => createClient(new Headers(), { set: () => undefined } as never)).not.toThrow();
  });
});
