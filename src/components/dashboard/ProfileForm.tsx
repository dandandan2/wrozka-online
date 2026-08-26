import React, { useState } from "react";
import { User, Calendar, ScrollText, CircleCheck } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { TextareaField } from "@/components/forms/TextareaField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";

interface Props {
  initialName: string | null;
  initialBirthDate: string | null;
  initialAboutMe: string | null;
  serverError?: string | null;
  successMessage?: string | null;
}

const ABOUT_ME_MAX_LENGTH = 500;

export default function ProfileForm({
  initialName,
  initialBirthDate,
  initialAboutMe,
  serverError,
  successMessage,
}: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [birthDate, setBirthDate] = useState(initialBirthDate ?? "");
  const [aboutMe, setAboutMe] = useState(initialAboutMe ?? "");
  const [errors, setErrors] = useState<{ name?: string; birthDate?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!name.trim()) {
      next.name = "Imię jest wymagane";
    }
    if (!birthDate) {
      next.birthDate = "Data urodzenia jest wymagana";
    } else if (new Date(birthDate) > new Date()) {
      next.birthDate = "Data urodzenia nie może być w przyszłości";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/profile/update" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Imię"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError("name");
        }}
        placeholder="Twoje imię"
        error={errors.name}
        icon={<User className="size-4" />}
      />

      <FormField
        id="birth_date"
        type="date"
        label="Data urodzenia"
        value={birthDate}
        onChange={(v) => {
          setBirthDate(v);
          clearError("birthDate");
        }}
        error={errors.birthDate}
        icon={<Calendar className="size-4" />}
      />

      <TextareaField
        id="about_me"
        label="O sobie"
        value={aboutMe}
        onChange={setAboutMe}
        placeholder="Kilka słów o Tobie (opcjonalnie)"
        maxLength={ABOUT_ME_MAX_LENGTH}
        icon={<ScrollText className="size-4" />}
      />

      {successMessage ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          <CircleCheck className="size-4 shrink-0" />
          {successMessage}
        </p>
      ) : null}

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie..." icon={<User className="size-4" />}>
        Zapisz profil
      </SubmitButton>
    </form>
  );
}
