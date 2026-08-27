export interface MockResponse {
  data?: unknown;
  error?: unknown;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface MockSupabaseClient {
  from: (table: string) => unknown;
}

const CHAIN_METHODS = ["select", "insert", "update", "delete", "eq", "order", "limit", "single"] as const;

/**
 * A fake Supabase query-builder client. Each `.from(table)` call returns a
 * chainable builder that records every method call and is itself thenable —
 * awaiting it (directly, or after `.single()`) resolves to the next queued
 * response. When only one response remains queued, it keeps being returned
 * for every subsequent await (so tests only need to specify responses that
 * differ from the default `{ data: null, error: null }`).
 */
export function createMockQueryClient(responses: MockResponse[] = []) {
  const calls: RecordedCall[] = [];
  const queue = [...responses];

  function nextResponse(): MockResponse {
    if (queue.length > 1) {
      const shifted = queue.shift();
      if (shifted) {
        return shifted;
      }
    }
    return queue[0] ?? { data: null, error: null };
  }

  function record(method: string, args: unknown[]) {
    calls.push({ method, args });
  }

  function makeBuilder(): Record<string, unknown> {
    const builder: Record<string, unknown> = {
      then(onFulfilled: (value: MockResponse) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
      },
    };
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        record(method, args);
        return builder;
      };
    }
    return builder;
  }

  const client: MockSupabaseClient = {
    from: (table: string) => {
      record("from", [table]);
      return makeBuilder();
    },
  };

  return { client, calls };
}

/** Returns, in call order, the second argument of every recorded `.eq(column, value)` call for `column`. */
export function eqArgsFor(calls: RecordedCall[], column: string): unknown[] {
  return calls.filter((call) => call.method === "eq" && call.args[0] === column).map((call) => call.args[1]);
}
