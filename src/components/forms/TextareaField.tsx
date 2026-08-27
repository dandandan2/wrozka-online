import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const textareaBase =
  "w-full rounded-xl bg-white/[0.04] border px-3 py-2.5 pl-10 text-[#f4e8cc] placeholder-[#e9ddc4]/30 focus:outline-none focus:ring-1 transition-colors resize-y";

interface TextareaFieldProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  maxLength?: number;
  rows?: number;
}

export function TextareaField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  maxLength,
  rows = 4,
}: TextareaFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-[#e9ddc4]/70">
        {label}
      </label>
      <div className="relative">
        <span className="absolute top-3 left-3 size-4 text-[#dcb877]/50">{icon}</span>
        <textarea
          id={id}
          name={name ?? id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          className={cn(
            textareaBase,
            error ? "border-red-400/60 focus:ring-red-400" : "border-[#d9b877]/15 focus:ring-[#c9a668]/50",
          )}
        />
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert strokeWidth={1.5} className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
      {maxLength ? (
        <p className="mt-1 text-right text-xs text-[#e9ddc4]/35">
          {value.length}/{maxLength}
        </p>
      ) : null}
    </div>
  );
}
