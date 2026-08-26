import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateFairyAnswer } from "@/lib/ai/fairy";

const QUESTION_MAX_LENGTH = 500;

interface ProfileRow {
  name: string | null;
  birth_date: string | null;
  about_me: string | null;
}

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
  const question = form.get("question");

  if (typeof question !== "string" || !question.trim()) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Wpisz pytanie do wróżki.")}`);
  }
  if (question.length > QUESTION_MAX_LENGTH) {
    return context.redirect(
      `/dashboard?error=${encodeURIComponent(`Pytanie może mieć maksymalnie ${QUESTION_MAX_LENGTH} znaków.`)}`,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, birth_date, about_me")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (!profile?.name || !profile.birth_date) {
    return context.redirect("/dashboard/profile");
  }

  const { data: likedRows } = await supabase
    .from("fairy_responses")
    .select("answer")
    .eq("user_id", user.id)
    .eq("liked", true)
    .order("created_at", { ascending: false })
    .limit(10);
  const likedAnswers = ((likedRows ?? []) as { answer: string }[]).map((row) => row.answer);

  let answer: string;
  try {
    answer = await generateFairyAnswer(
      { name: profile.name, birthDate: profile.birth_date, aboutMe: profile.about_me },
      question,
      likedAnswers,
    );
  } catch (err) {
    console.error("generateFairyAnswer failed:", err);
    return context.redirect(
      `/dashboard?error=${encodeURIComponent("Wróżka nie mogła odpowiedzieć. Spróbuj ponownie.")}`,
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("fairy_responses")
    .insert({ user_id: user.id, question, answer })
    .select("id")
    .single();

  if (insertError) {
    return context.redirect(
      `/dashboard?error=${encodeURIComponent("Wróżka nie mogła odpowiedzieć. Spróbuj ponownie.")}`,
    );
  }

  return context.redirect(`/dashboard?response=${inserted.id}`);
};
