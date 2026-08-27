import { vi } from "vitest";

export interface AuthResponse {
  data?: unknown;
  error?: unknown;
}

export interface MockSupabaseAuthClient {
  auth: {
    signInWithOtp: ReturnType<typeof vi.fn>;
    verifyOtp: ReturnType<typeof vi.fn>;
    exchangeCodeForSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
}

export type AuthMethod = "signInWithOtp" | "verifyOtp" | "exchangeCodeForSession" | "signOut";

const DEFAULT_RESPONSE: AuthResponse = { data: {}, error: null };

/**
 * A fake Supabase Auth client. Every method defaults to a successful
 * `{ data: {}, error: null }` response; pass `overrides` to make a specific
 * method resolve to a configured response instead (e.g. simulating a
 * Supabase error code).
 */
export function createMockAuthClient(
  overrides: Partial<Record<AuthMethod, AuthResponse>> = {},
): MockSupabaseAuthClient {
  return {
    auth: {
      signInWithOtp: vi.fn(() => Promise.resolve(overrides.signInWithOtp ?? DEFAULT_RESPONSE)),
      verifyOtp: vi.fn(() => Promise.resolve(overrides.verifyOtp ?? DEFAULT_RESPONSE)),
      exchangeCodeForSession: vi.fn(() => Promise.resolve(overrides.exchangeCodeForSession ?? DEFAULT_RESPONSE)),
      signOut: vi.fn(() => Promise.resolve(overrides.signOut ?? DEFAULT_RESPONSE)),
    },
  };
}
