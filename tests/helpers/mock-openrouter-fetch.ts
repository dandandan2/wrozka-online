import { vi } from "vitest";

export type OpenRouterFetchScenario = "ok" | "nonOk" | "missingContent" | "networkFailure";

/**
 * Stubs global `fetch` to simulate OpenRouter's HTTP boundary (the only
 * external call `generateFairyAnswer` makes), so tests can drive AI-provider
 * failure modes without mocking `src/lib/ai/fairy.ts` internally. Call
 * `vi.unstubAllGlobals()` in an `afterEach` in the consuming test file to
 * avoid leaking the stub across test files.
 */
export function stubOpenRouterFetch(scenario: OpenRouterFetchScenario, answer = "mock answer"): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      switch (scenario) {
        case "ok":
          return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }), { status: 200 });
        case "nonOk":
          return new Response("Internal Server Error", { status: 500 });
        case "missingContent":
          return new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 });
        case "networkFailure":
          throw new DOMException("The operation was aborted.", "TimeoutError");
      }
    }),
  );
}
