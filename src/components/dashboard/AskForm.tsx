import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { TextareaField } from "@/components/forms/TextareaField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  serverError?: string | null;
}

const QUESTION_MAX_LENGTH = 500;

export default function AskForm({ serverError }: Props) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | undefined>();

  function validate() {
    if (!question.trim()) {
      setError("Wpisz pytanie do wróżki");
      return false;
    }
    setError(undefined);
    return true;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/fairy/ask" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <TextareaField
        id="question"
        label="Twoje pytanie do wróżki"
        value={question}
        onChange={setQuestion}
        placeholder="O co chcesz zapytać wróżkę?"
        error={error}
        maxLength={QUESTION_MAX_LENGTH}
        icon={<Sparkles className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Wróżka się zastanawia..." icon={<Sparkles className="size-4" />}>
        Zapytaj wróżkę
      </SubmitButton>
    </form>
  );
}
