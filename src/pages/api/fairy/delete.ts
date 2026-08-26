import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard/history?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const id = form.get("id");

  if (typeof id !== "string" || !id) {
    return context.redirect("/dashboard/history");
  }

  const { error } = await supabase.from("fairy_responses").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return context.redirect(
      `/dashboard/history?error=${encodeURIComponent("Nie udało się usunąć wpisu. Spróbuj ponownie.")}`,
    );
  }

  return context.redirect("/dashboard/history");
};
