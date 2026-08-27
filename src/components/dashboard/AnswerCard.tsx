import { Heart, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  question: string;
  answer: string;
  liked: boolean;
}

export default function AnswerCard({ id, question, answer, liked }: Props) {
  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
      <div>
        <p className="text-xs tracking-wide text-blue-100/50 uppercase">Twoje pytanie</p>
        <p className="mt-1 text-sm text-blue-100/80">{question}</p>
      </div>
      <div>
        <p className="text-xs tracking-wide text-blue-100/50 uppercase">Odpowiedź wróżki</p>
        <p className="mt-1 whitespace-pre-wrap text-white">{answer}</p>
      </div>

      <p className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-blue-100/60">
        <CircleAlert className="size-3 shrink-0" />
        To rozrywka, nie porada. Nie zastępuje profesjonalnej pomocy medycznej, finansowej ani prawnej.
      </p>

      <form method="POST" action="/api/fairy/like">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors",
            liked
              ? "border-pink-400/40 bg-pink-500/20 text-pink-200 hover:bg-pink-500/30"
              : "border-white/20 bg-white/10 text-white hover:bg-white/20",
          )}
        >
          <Heart className={cn("size-4", liked && "fill-current")} />
          {liked ? "Polubione" : "Polub odpowiedź"}
        </button>
      </form>
    </div>
  );
}
