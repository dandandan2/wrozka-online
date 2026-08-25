import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { toAuthErrorMessage } from "@/lib/auth-errors";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email");
  const code = form.get("code");
  if (typeof email !== "string" || !email || typeof code !== "string" || !code) {
    return context.redirect(
      `/auth/confirm-email?email=${encodeURIComponent(
        typeof email === "string" ? email : "",
      )}&error=${encodeURIComponent("Enter the code from your email.")}`,
    );
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(
      `/auth/confirm-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent("Supabase is not configured")}`,
    );
  }

  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

  if (error) {
    return context.redirect(
      `/auth/confirm-email?email=${encodeURIComponent(email)}&error=${encodeURIComponent(toAuthErrorMessage(error))}`,
    );
  }

  return context.redirect("/");
};
