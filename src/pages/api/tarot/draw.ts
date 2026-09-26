import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateTarotReading } from "@/lib/ai/tarot";
import { checkFairyAnswerSafety } from "@/lib/ai/safety-checker";
import { drawCard } from "@/lib/tarot/cards";

const QUESTION_MAX_LENGTH = 500;
const TAROT_FAILURE_MESSAGE = "Karty nie chciały dziś przemówić. Spróbuj ponownie.";

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
    return context.redirect(`/dashboard/tarot?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawQuestion = form.get("question");
  const question = typeof rawQuestion === "string" && rawQuestion.trim() ? rawQuestion.trim() : null;

  if (question && question.length > QUESTION_MAX_LENGTH) {
    return context.redirect(
      `/dashboard/tarot?error=${encodeURIComponent(`Pytanie może mieć maksymalnie ${QUESTION_MAX_LENGTH} znaków.`)}`,
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
    .from("tarot_readings")
    .select("answer")
    .eq("user_id", user.id)
    .eq("liked", true)
    .order("created_at", { ascending: false })
    .limit(10);
  const likedAnswers = ((likedRows ?? []) as { answer: string }[]).map((row) => row.answer);

  const { card, orientation } = drawCard();

  let answer: string;
  try {
    answer = await generateTarotReading(
      { name: profile.name, birthDate: profile.birth_date, aboutMe: profile.about_me },
      card,
      orientation,
      question,
      likedAnswers,
    );
  } catch (err) {
    console.error("generateTarotReading failed:", err);
    return context.redirect(`/dashboard/tarot?error=${encodeURIComponent(TAROT_FAILURE_MESSAGE)}`);
  }

  const safety = checkFairyAnswerSafety(answer);
  if (!safety.safe) {
    console.error(`generateTarotReading flagged unsafe (${safety.category}), discarding answer`);
    return context.redirect(`/dashboard/tarot?error=${encodeURIComponent(TAROT_FAILURE_MESSAGE)}`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tarot_readings")
    .insert({ user_id: user.id, question, card_key: card.key, orientation, answer })
    .select("id")
    .single();

  if (insertError) {
    return context.redirect(`/dashboard/tarot?error=${encodeURIComponent(TAROT_FAILURE_MESSAGE)}`);
  }

  return context.redirect(`/dashboard/tarot?reading=${inserted.id}`);
};
