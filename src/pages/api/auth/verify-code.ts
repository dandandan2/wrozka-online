import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const code = form.get("code") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(
      `/auth/confirm-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent("Supabase is not configured")}`,
    );
  }

  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    return context.redirect(
      `/auth/confirm-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent(error.message)}`,
    );
  }

  return context.redirect("/");
};
