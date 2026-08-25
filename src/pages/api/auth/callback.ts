import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toAuthErrorMessage } from "@/lib/auth-errors";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  if (!code) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Missing or invalid login link")}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(toAuthErrorMessage(error))}`);
  }

  return context.redirect("/");
};
