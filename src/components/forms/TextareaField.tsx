import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const textareaBase =
  "w-full rounded-lg bg-white/10 border px-3 py-2 pl-10 text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-colors resize-y";

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
      <label htmlFor={id} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <div className="relative">
        <span className="absolute top-3 left-3 size-4 text-white/40">{icon}</span>
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
            error ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
      </div>
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
      {maxLength ? (
        <p className="mt-1 text-right text-xs text-white/40">
          {value.length}/{maxLength}
        </p>
      ) : null}
    </div>
  );
}
