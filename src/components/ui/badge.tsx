import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-3 text-ink-2 border-transparent",
  info: "bg-info-soft text-info border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
  brand: "bg-brand-soft text-brand-ink border-transparent",
  ink: "bg-ink text-white border-transparent",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[5px] border px-1.5 py-px text-[11.5px] font-medium leading-[18px] whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
