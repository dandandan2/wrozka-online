export interface FakeContextOptions {
  userId: string | null;
  formData?: Record<string, string>;
  url?: string;
}

export interface FakeContextResult {
  context: unknown;
  redirects: string[];
}

/**
 * A minimal stand-in for Astro's `APIContext`, covering only what the
 * hermetic route-handler tests in this rollout phase touch: `locals.user`,
 * `request` (headers/url/formData), `cookies`, and `redirect`.
 */
export function createFakeContext(options: FakeContextOptions): FakeContextResult {
  const redirects: string[] = [];
  const form = new FormData();
  for (const [key, value] of Object.entries(options.formData ?? {})) {
    form.set(key, value);
  }

  const context = {
    locals: { user: options.userId === null ? null : { id: options.userId } },
    request: {
      headers: new Headers(),
      url: options.url ?? "http://localhost/",
      formData: () => Promise.resolve(form),
    },
    cookies: {
      set: () => undefined,
      get: () => undefined,
    },
    url: new URL(options.url ?? "http://localhost/"),
    redirect: (url: string) => {
      redirects.push(url);
      return new Response(null, { status: 302, headers: { Location: url } });
    },
  };

  return { context, redirects };
}
