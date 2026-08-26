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

  const { data: current } = await supabase
    .from("fairy_responses")
    .select("liked")
    .eq("id", id)
    .single<{ liked: boolean }>();

  if (current) {
    await supabase.from("fairy_responses").update({ liked: !current.liked }).eq("id", id);
  }

  return context.redirect(`/dashboard?response=${id}`);
};
