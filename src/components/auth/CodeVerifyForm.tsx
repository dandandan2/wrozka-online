import React, { useState } from "react";
import { KeyRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  email: string;
  serverError?: string | null;
}

export default function CodeVerifyForm({ email, serverError }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!code.trim()) {
      setError("Code is required");
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/auth/verify-code" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="email" value={email} />

      <FormField
        id="code"
        name="code"
        label="Or enter the 6-digit code"
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(undefined);
        }}
        placeholder="123456"
        error={error}
        icon={<KeyRound className="size-4" />}
        maxLength={6}
        inputMode="numeric"
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Verifying..." icon={<KeyRound className="size-4" />}>
        Verify code
      </SubmitButton>
    </form>
  );
}
