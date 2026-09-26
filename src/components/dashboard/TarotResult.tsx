import { Heart, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  cardKey: string;
  cardName: string;
  orientation: "upright" | "reversed";
  question: string | null;
  answer: string;
  liked: boolean;
}

export default function TarotResult({ id, cardKey, cardName, orientation, question, answer, liked }: Props) {
  const orientationLabel = orientation === "upright" ? "Prosto" : "Odwrócona";

  return (
    <div className="mt-6 space-y-4 rounded-[1.75rem] border border-[#d9b877]/12 bg-white/[0.025] p-6 text-left shadow-[inset_0_1px_1px_rgba(244,232,204,0.05)]">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <img src={`/tarot/${cardKey}.svg`} alt={cardName} className="h-40 w-auto shrink-0 rounded-xl" />
        <div className="text-center sm:text-left">
          <p className="text-xs tracking-wide text-[#dcb877]/60 uppercase">Wylosowana karta</p>
          <p className="mt-1 text-lg font-medium text-[#f4e8cc]">
            {cardName} <span className="text-[#e9ddc4]/60">({orientationLabel})</span>
          </p>
        </div>
      </div>

      {question && (
        <div>
          <p className="text-xs tracking-wide text-[#dcb877]/60 uppercase">Twoje pytanie</p>
          <p className="mt-1 text-sm text-[#e9ddc4]/75">{question}</p>
        </div>
      )}

      <div>
        <p className="text-xs tracking-wide text-[#dcb877]/60 uppercase">Znaczenie karty</p>
        <p className="mt-1 whitespace-pre-wrap text-[#f4e8cc]">{answer}</p>
      </div>

      <p className="flex items-center gap-2 rounded-full border border-[#d9b877]/15 bg-white/[0.03] px-3 py-2 text-xs text-[#e9ddc4]/50">
        <CircleAlert strokeWidth={1.5} className="size-3 shrink-0" />
        To rozrywka, nie porada. Nie zastępuje profesjonalnej pomocy medycznej, finansowej ani prawnej.
      </p>

      <form method="POST" action="/api/tarot/like">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="redirect_to" value="/dashboard/tarot" />
        <button
          type="submit"
          className={cn(
            "flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors",
            liked
              ? "border-[#c9436a]/40 bg-[#c9436a]/15 text-[#eba8bd] hover:bg-[#c9436a]/25"
              : "border-[#d9b877]/15 bg-white/[0.03] text-[#e9ddc4]/75 hover:border-[#d9b877]/30",
          )}
        >
          <Heart strokeWidth={1.5} className={cn("size-4", liked && "fill-current")} />
          {liked ? "Polubione" : "Polub wróżbę"}
        </button>
      </form>
    </div>
  );
}
