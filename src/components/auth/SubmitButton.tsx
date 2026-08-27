import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pendingText, icon, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-gradient-to-b from-[#e8cf9c] to-[#c9a668] px-4 py-2.5 font-medium text-[#1c1408] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_10px_24px_-10px_rgba(201,166,104,0.55)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:brightness-105 active:scale-[0.98]"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-[#1c1408]/30 border-t-[#1c1408]" />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
