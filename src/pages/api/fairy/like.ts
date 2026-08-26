import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const id = form.get("id");

  if (typeof id !== "string" || !id) {
    return context.redirect("/dashboard");
  }

  const { data: current, error: selectError } = await supabase
    .from("fairy_responses")
    .select("liked")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<{ liked: boolean }>();

  if (selectError) {
    return context.redirect(
      `/dashboard?response=${id}&error=${encodeURIComponent("Nie udało się zaktualizować polubienia.")}`,
    );
  }

  const { error: updateError } = await supabase
    .from("fairy_responses")
    .update({ liked: !current.liked })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return context.redirect(
      `/dashboard?response=${id}&error=${encodeURIComponent("Nie udało się zaktualizować polubienia.")}`,
    );
  }

  return context.redirect(`/dashboard?response=${id}`);
};
