import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toAuthErrorMessage } from "@/lib/auth-errors";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email");
  if (typeof email !== "string" || !email) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Enter your email address.")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${new URL(context.request.url).origin}/api/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(toAuthErrorMessage(error))}`);
  }

  return context.redirect(`/auth/confirm-email?email=${encodeURIComponent(email)}`);
};
