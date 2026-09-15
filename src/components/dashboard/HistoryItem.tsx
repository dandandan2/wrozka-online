import type React from "react";
import { Heart, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  type: "fairy" | "tarot";
  question: string | null;
  answer: string;
  liked: boolean;
  createdAt: string;
  cardName?: string;
  orientation?: "upright" | "reversed";
}

export default function HistoryItem({ id, type, question, answer, liked, createdAt, cardName, orientation }: Props) {
  const likeAction = type === "fairy" ? "/api/fairy/like" : "/api/tarot/like";
  const deleteAction = type === "fairy" ? "/api/fairy/delete" : "/api/tarot/delete";
  const orientationLabel = orientation === "upright" ? "Prosto" : orientation === "reversed" ? "Odwrócona" : null;

  function handleDeleteSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!window.confirm("Usunąć ten wpis na stałe? Tej operacji nie można cofnąć.")) {
      e.preventDefault();
    }
  }

  return (
    <div className="space-y-3 rounded-[1.75rem] border border-[#d9b877]/12 bg-white/[0.025] p-5 text-left shadow-[inset_0_1px_1px_rgba(244,232,204,0.05)]">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#e9ddc4]/35">
          {new Date(createdAt).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })}
        </p>
        <span className="rounded-full border border-[#d9b877]/15 bg-white/[0.03] px-2.5 py-1 text-[10px] tracking-wide text-[#dcb877]/70 uppercase">
          {type === "fairy" ? "Wróżka" : "Tarot"}
        </span>
      </div>

      {type === "tarot" && cardName && (
        <div>
          <p className="text-xs tracking-wide text-[#dcb877]/60 uppercase">Wylosowana karta</p>
          <p className="mt-1 text-sm text-[#f4e8cc]">
            {cardName} {orientationLabel && <span className="text-[#e9ddc4]/60">({orientationLabel})</span>}
          </p>
        </div>
      )}

      {question && (
        <div>
          <p className="text-xs tracking-wide text-[#dcb877]/60 uppercase">
            {type === "fairy" ? "Twoje pytanie" : "Twoje pytanie do kart"}
          </p>
          <p className="mt-1 text-sm text-[#e9ddc4]/75">{question}</p>
        </div>
      )}
      <div>
        <p className="text-xs tracking-wide text-[#dcb877]/60 uppercase">
          {type === "fairy" ? "Odpowiedź wróżki" : "Znaczenie karty"}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[#f4e8cc]">{answer}</p>
      </div>

      <div className="flex items-center gap-2">
        <form method="POST" action={likeAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="redirect_to" value="/dashboard/history" />
          <button
            type="submit"
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
              liked
                ? "border-[#c9436a]/40 bg-[#c9436a]/15 text-[#eba8bd] hover:bg-[#c9436a]/25"
                : "border-[#d9b877]/15 bg-white/[0.03] text-[#e9ddc4]/75 hover:border-[#d9b877]/30",
            )}
          >
            <Heart strokeWidth={1.5} className={cn("size-4", liked && "fill-current")} />
            {liked ? "Polubione" : "Polub"}
          </button>
        </form>

        <form method="POST" action={deleteAction} onSubmit={handleDeleteSubmit}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-full border border-[#d9b877]/15 bg-white/[0.03] px-3 py-1.5 text-sm text-red-300/80 transition-colors hover:bg-red-500/15"
          >
            <Trash2 strokeWidth={1.5} className="size-4" />
            Usuń
          </button>
        </form>
      </div>
    </div>
  );
}
