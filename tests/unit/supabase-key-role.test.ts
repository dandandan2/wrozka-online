import { describe, expect, it } from "vitest";
import { SUPABASE_KEY } from "astro:env/server";

function decodeJwtPayload(token: string): Record<string, unknown> {
  const segments = token.split(".");
  const payloadSegment = segments[1];
  if (!payloadSegment) {
    throw new Error("SUPABASE_KEY is not a JWT — cannot decode a role claim from it");
  }
  const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

// This verifies whatever SUPABASE_KEY the current environment supplies — by
// default the dummy JWT baked into tests/setup/astro-env-server.ts (which is
// deliberately role: "anon"), not a real deployed key. It only gains real
// signal against a real project once a real key is supplied via .env.test
// (see .env.test.example). Same class of limitation documented inline in
// tests/unit/auth-rate-limit.test.ts.
describe("SUPABASE_KEY role claim", () => {
  it("decodes to role: anon, never service_role", () => {
    if (!SUPABASE_KEY) {
      throw new Error("SUPABASE_KEY is not set in this test environment");
    }
    const payload = decodeJwtPayload(SUPABASE_KEY);
    expect(payload.role).toBe("anon");
  });
});
