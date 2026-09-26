import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/fairy", () => ({ generateFairyAnswer: vi.fn(() => Promise.resolve("mock answer")) }));

const { createClient } = await import("@/lib/supabase");
const { POST: askHandler } = await import("@/pages/api/fairy/ask");
const { POST: likeHandler } = await import("@/pages/api/fairy/like");

const SESSION_USER_ID = "session-user-ddd";
const RESPONSE_ID = "response-abc";
const QUESTION_MAX_LENGTH = 500;

const COMPLETE_PROFILE = { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null };

/**
 * Every redirect target of the fairy routes, asserted on the response's
 * `Location` header. The p6 move of the ask form from `/dashboard` to
 * `/dashboard/fairy` left these handlers pointing at a page that no longer
 * reads `?error` or `?response`, which silently swallowed every fairy error
 * message and the freshly generated answer. Asserting only that a handler
 * redirected *somewhere* is what let that through, so pin the paths.
 */
describe("ask.ts redirect targets", () => {
  it("sends an unauthenticated request to sign-in", async () => {
    const { context } = createFakeContext({ userId: null, formData: { question: "Czy będę szczęśliwy?" } });
    const response = await askHandler(context as never);

    expect(response.headers.get("Location")).toBe("/auth/signin");
  });

  it("reports a blank question on the fairy page", async () => {
    vi.mocked(createClient).mockReturnValue(createMockQueryClient().client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { question: "   " } });
    const response = await askHandler(context as never);

    expect(response.headers.get("Location")).toBe(
      `/dashboard/fairy?error=${encodeURIComponent("Wpisz pytanie do wróżki.")}`,
    );
  });

  it("reports an over-length question on the fairy page", async () => {
    vi.mocked(createClient).mockReturnValue(createMockQueryClient().client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "a".repeat(QUESTION_MAX_LENGTH + 1) },
    });
    const response = await askHandler(context as never);

    expect(response.headers.get("Location")).toBe(
      `/dashboard/fairy?error=${encodeURIComponent(`Pytanie może mieć maksymalnie ${QUESTION_MAX_LENGTH} znaków.`)}`,
    );
  });

  it("sends a user with an incomplete profile to the profile page, not the fairy page", async () => {
    const { client } = createMockQueryClient([{ data: { name: null, birth_date: null, about_me: null }, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { question: "Czy będę szczęśliwy?" } });
    const response = await askHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/profile");
  });

  it("sends a successful ask back to the fairy page with the new response id", async () => {
    const { client } = createMockQueryClient([
      COMPLETE_PROFILE,
      { data: [], error: null },
      { data: { id: RESPONSE_ID }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { question: "Czy będę szczęśliwy?" } });
    const response = await askHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/fairy?response=${RESPONSE_ID}`);
  });
});

describe("like.ts redirect targets", () => {
  const LIKE_ERROR = encodeURIComponent("Nie udało się zaktualizować polubienia.");

  it("returns to the fairy page with the response id on success", async () => {
    const { client } = createMockQueryClient([
      { data: { liked: false }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: RESPONSE_ID, redirect_to: "/dashboard/fairy" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/fairy?response=${RESPONSE_ID}`);
  });

  it("keeps the response id on the fairy page when the update fails", async () => {
    const { client } = createMockQueryClient([
      { data: { liked: false }, error: null },
      { data: null, error: { message: "update failed" } },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: RESPONSE_ID, redirect_to: "/dashboard/fairy" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/fairy?response=${RESPONSE_ID}&error=${LIKE_ERROR}`);
  });

  it("falls back to the fairy page when no id was submitted", async () => {
    vi.mocked(createClient).mockReturnValue(createMockQueryClient().client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/fairy");
  });

  it("stays on the history page when the like came from there", async () => {
    const { client } = createMockQueryClient([
      { data: { liked: true }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: RESPONSE_ID, redirect_to: "/dashboard/history" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/history");
  });

  it("reports a history-page like failure on the history page", async () => {
    const { client } = createMockQueryClient([{ data: null, error: { message: "not found" } }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: RESPONSE_ID, redirect_to: "/dashboard/history" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/history?error=${LIKE_ERROR}`);
  });
});
