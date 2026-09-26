import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/tarot", () => ({ generateTarotReading: vi.fn(() => Promise.resolve("mock reading")) }));
vi.mock("@/lib/tarot/cards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tarot/cards")>();
  return {
    ...actual,
    drawCard: vi.fn(() => ({ card: actual.MAJOR_ARCANA[0], orientation: "upright" as const })),
  };
});

const { createClient } = await import("@/lib/supabase");
const { generateTarotReading } = await import("@/lib/ai/tarot");
const { POST: drawHandler } = await import("@/pages/api/tarot/draw");
const { POST: likeHandler } = await import("@/pages/api/tarot/like");
const { POST: deleteHandler } = await import("@/pages/api/tarot/delete");

const SESSION_USER_ID = "session-user-iii";
const READING_ID = "reading-abc";
const QUESTION_MAX_LENGTH = 500;
const TAROT_FAILURE_MESSAGE = "Karty nie chciały dziś przemówić. Spróbuj ponownie.";

const COMPLETE_PROFILE = { data: { name: "Ala", birth_date: "1990-01-01", about_me: null }, error: null };
const NO_LIKED_READINGS = { data: [], error: null };

/**
 * The tarot counterpart of `api-fairy-redirect-targets.test.ts`. The fairy
 * routes regressed because the ask form moved to a new page while the handlers
 * kept redirecting at the old one, and the tests of the day only asserted that
 * a handler redirected *somewhere*. The tarot handlers carry the same
 * page-coupled targets (`/dashboard/tarot`, `/dashboard/history`,
 * `/dashboard/profile`) and had the same blind spot, so pin every path here
 * too — including the over-length-question and missing-id branches, which no
 * other test reached.
 */
describe("tarot draw.ts redirect targets", () => {
  it("sends an unauthenticated request to sign-in", async () => {
    const { context } = createFakeContext({ userId: null, formData: {} });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe("/auth/signin");
  });

  it("reports an over-length question on the tarot page without querying Supabase", async () => {
    const { client, consumedResponseCount } = createMockQueryClient();
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "a".repeat(QUESTION_MAX_LENGTH + 1) },
    });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe(
      `/dashboard/tarot?error=${encodeURIComponent(`Pytanie może mieć maksymalnie ${QUESTION_MAX_LENGTH} znaków.`)}`,
    );
    expect(consumedResponseCount()).toBe(0);
  });

  it("accepts a question at exactly the length limit", async () => {
    const { client } = createMockQueryClient([
      COMPLETE_PROFILE,
      NO_LIKED_READINGS,
      { data: { id: READING_ID }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { question: "a".repeat(QUESTION_MAX_LENGTH) },
    });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/tarot?reading=${READING_ID}`);
  });

  it("sends a user with an incomplete profile to the profile page, not the tarot page", async () => {
    const { client } = createMockQueryClient([{ data: { name: null, birth_date: null, about_me: null }, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/profile");
  });

  it("reports an AI-provider failure on the tarot page", async () => {
    vi.mocked(generateTarotReading).mockRejectedValueOnce(new Error("provider down"));
    const { client } = createMockQueryClient([COMPLETE_PROFILE, NO_LIKED_READINGS]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe(
      `/dashboard/tarot?error=${encodeURIComponent(TAROT_FAILURE_MESSAGE)}`,
    );
  });

  it("reports a failed insert on the tarot page", async () => {
    const { client } = createMockQueryClient([
      COMPLETE_PROFILE,
      NO_LIKED_READINGS,
      { data: null, error: { message: "insert failed" } },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe(
      `/dashboard/tarot?error=${encodeURIComponent(TAROT_FAILURE_MESSAGE)}`,
    );
  });

  it("sends a successful draw back to the tarot page with the new reading id", async () => {
    const { client } = createMockQueryClient([
      COMPLETE_PROFILE,
      NO_LIKED_READINGS,
      { data: { id: READING_ID }, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await drawHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/tarot?reading=${READING_ID}`);
  });
});

describe("tarot like.ts redirect targets", () => {
  const LIKE_ERROR = encodeURIComponent("Nie udało się zaktualizować polubienia.");

  it("returns to the tarot page with the reading id on success", async () => {
    const { client } = createMockQueryClient([
      { data: { liked: false }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: READING_ID } });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/tarot?reading=${READING_ID}`);
  });

  it("keeps the reading id on the tarot page when the update fails", async () => {
    const { client } = createMockQueryClient([
      { data: { liked: false }, error: null },
      { data: null, error: { message: "update failed" } },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: READING_ID } });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/tarot?reading=${READING_ID}&error=${LIKE_ERROR}`);
  });

  it("keeps the reading id on the tarot page when the row lookup fails", async () => {
    const { client } = createMockQueryClient([{ data: null, error: { message: "not found" } }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: READING_ID } });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/tarot?reading=${READING_ID}&error=${LIKE_ERROR}`);
  });

  it("falls back to the tarot page when no id was submitted", async () => {
    vi.mocked(createClient).mockReturnValue(createMockQueryClient().client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/tarot");
  });

  it("falls back to the history page when no id was submitted from there", async () => {
    vi.mocked(createClient).mockReturnValue(createMockQueryClient().client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { redirect_to: "/dashboard/history" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/history");
  });

  it("stays on the history page when the like came from there", async () => {
    const { client } = createMockQueryClient([
      { data: { liked: true }, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: READING_ID, redirect_to: "/dashboard/history" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/history");
  });

  it("reports a history-page like failure on the history page", async () => {
    const { client } = createMockQueryClient([{ data: null, error: { message: "not found" } }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { id: READING_ID, redirect_to: "/dashboard/history" },
    });
    const response = await likeHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/history?error=${LIKE_ERROR}`);
  });
});

describe("tarot delete.ts redirect targets", () => {
  const DELETE_ERROR = encodeURIComponent("Nie udało się usunąć wpisu. Spróbuj ponownie.");

  it("sends an unauthenticated request to sign-in", async () => {
    const { context } = createFakeContext({ userId: null, formData: { id: READING_ID } });
    const response = await deleteHandler(context as never);

    expect(response.headers.get("Location")).toBe("/auth/signin");
  });

  it("returns to the history page when no id was submitted, without deleting anything", async () => {
    const { client, calls } = createMockQueryClient();
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: {} });
    const response = await deleteHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/history");
    expect(calls.some((call) => call.method === "delete")).toBe(false);
  });

  it("returns to the history page on a successful delete", async () => {
    const { client } = createMockQueryClient([{ data: null, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: READING_ID } });
    const response = await deleteHandler(context as never);

    expect(response.headers.get("Location")).toBe("/dashboard/history");
  });

  it("reports a failed delete on the history page", async () => {
    const { client } = createMockQueryClient([{ data: null, error: { message: "delete failed" } }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({ userId: SESSION_USER_ID, formData: { id: READING_ID } });
    const response = await deleteHandler(context as never);

    expect(response.headers.get("Location")).toBe(`/dashboard/history?error=${DELETE_ERROR}`);
  });
});
