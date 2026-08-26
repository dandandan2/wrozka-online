import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const ABOUT_ME_MAX_LENGTH = 500;

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/profile?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const name = form.get("name");
  const birthDate = form.get("birth_date");
  const aboutMe = form.get("about_me");

  if (typeof aboutMe === "string" && aboutMe.length > ABOUT_ME_MAX_LENGTH) {
    return context.redirect(
      `/dashboard/profile?error=${encodeURIComponent(`"O sobie" może mieć maksymalnie ${ABOUT_ME_MAX_LENGTH} znaków.`)}`,
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: typeof name === "string" && name ? name : null,
      birth_date: typeof birthDate === "string" && birthDate ? birthDate : null,
      about_me: typeof aboutMe === "string" && aboutMe ? aboutMe : null,
    })
    .eq("id", user.id);

  if (error) {
    return context.redirect(
      `/dashboard/profile?error=${encodeURIComponent("Nie udało się zapisać profilu. Spróbuj ponownie.")}`,
    );
  }

  return context.redirect("/dashboard");
};
