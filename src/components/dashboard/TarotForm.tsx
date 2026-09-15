import { useState } from "react";
import { Sparkles } from "lucide-react";
import { TextareaField } from "@/components/forms/TextareaField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  serverError?: string | null;
}

const QUESTION_MAX_LENGTH = 500;

export default function TarotForm({ serverError }: Props) {
  const [question, setQuestion] = useState("");

  return (
    <form method="POST" action="/api/tarot/draw" className="space-y-4">
      <TextareaField
        id="question"
        label="Twoje pytanie do kart (opcjonalnie)"
        value={question}
        onChange={setQuestion}
        placeholder="O co chcesz zapytać karty? Możesz zostawić puste i wylosować kartę dnia."
        maxLength={QUESTION_MAX_LENGTH}
        icon={<Sparkles className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Karty się tasują..." icon={<Sparkles className="size-4" />}>
        Wylosuj kartę
      </SubmitButton>
    </form>
  );
}
