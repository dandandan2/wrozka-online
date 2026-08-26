import type React from "react";
import { Heart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  question: string;
  answer: string;
  liked: boolean;
  createdAt: string;
}

export default function HistoryItem({ id, question, answer, liked, createdAt }: Props) {
  function handleDeleteSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!window.confirm("Usunąć ten wpis na stałe? Tej operacji nie można cofnąć.")) {
      e.preventDefault();
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-left">
      <p className="text-xs text-blue-100/40">
        {new Date(createdAt).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })}
      </p>
      <div>
        <p className="text-xs tracking-wide text-blue-100/50 uppercase">Twoje pytanie</p>
        <p className="mt-1 text-sm text-blue-100/80">{question}</p>
      </div>
      <div>
        <p className="text-xs tracking-wide text-blue-100/50 uppercase">Odpowiedź wróżki</p>
        <p className="mt-1 whitespace-pre-wrap text-white">{answer}</p>
      </div>

      <div className="flex items-center gap-2">
        <form method="POST" action="/api/fairy/like">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="redirect_to" value="/dashboard/history" />
          <button
            type="submit"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
              liked
                ? "border-pink-400/40 bg-pink-500/20 text-pink-200 hover:bg-pink-500/30"
                : "border-white/20 bg-white/10 text-white hover:bg-white/20",
            )}
          >
            <Heart className={cn("size-4", liked && "fill-current")} />
            {liked ? "Polubione" : "Polub"}
          </button>
        </form>

        <form method="POST" action="/api/fairy/delete" onSubmit={handleDeleteSubmit}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-red-300 transition-colors hover:bg-red-500/20"
          >
            <Trash2 className="size-4" />
            Usuń
          </button>
        </form>
      </div>
    </div>
  );
}
