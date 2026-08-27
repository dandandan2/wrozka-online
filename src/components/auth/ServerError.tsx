import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-950/30 px-3 py-2 text-sm text-red-300/90">
      <CircleAlert strokeWidth={1.5} className="size-4 shrink-0" />
      {message}
    </p>
  );
}
