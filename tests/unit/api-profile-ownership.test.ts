import { describe, expect, it, vi } from "vitest";
import { createFakeContext } from "../helpers/fake-api-context";
import { createMockQueryClient, eqArgsFor } from "../helpers/mock-supabase-client";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase");
const { POST: updateHandler } = await import("@/pages/api/profile/update");

const SESSION_USER_ID = "session-user-bbb";

describe("profile/update.ts ownership filtering", () => {
  it("filters the update by locals.user.id and never touches insert/delete on profiles", async () => {
    const { client, calls, consumedResponseCount } = createMockQueryClient([{ data: null, error: null }]);
    vi.mocked(createClient).mockReturnValue(client as never);

    const { context } = createFakeContext({
      userId: SESSION_USER_ID,
      formData: { name: "Ala", birth_date: "1990-01-01", about_me: "hello" },
    });
    await updateHandler(context as never);

    expect(eqArgsFor(calls, "id")).toEqual([SESSION_USER_ID]);
    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(calls.some((call) => call.method === "delete")).toBe(false);
    expect(consumedResponseCount()).toBe(1);
  });
});
