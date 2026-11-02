import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Avatar({ name, color, size = 28, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, background: color ?? "#4b5260", fontSize: Math.max(10, size * 0.38) }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
