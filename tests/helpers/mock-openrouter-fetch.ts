import { afterEach, vi } from "vitest";

export type OpenRouterFetchScenario = "ok" | "nonOk" | "missingContent" | "networkFailure";

// Cleanup is registered here (not left to each consumer) so the stubbed
// `fetch` can never leak into a later test file in the same worker.
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stubs global `fetch` to simulate OpenRouter's HTTP boundary (the only
 * external call `generateFairyAnswer` makes), so tests can drive AI-provider
 * failure modes without mocking `src/lib/ai/fairy.ts` internally.
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
          return Promise.reject(new DOMException("The operation was aborted.", "TimeoutError"));
      }
    }),
  );
}
