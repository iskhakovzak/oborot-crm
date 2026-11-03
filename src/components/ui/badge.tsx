import { cn } from "@/lib/utils";

/* Бейдж в духе FounderOS: моно, капс, обводка в тон */
const tones = {
  neutral: "border-line-strong text-ink-2",
  info: "border-info/40 bg-info/10 text-info",
  good: "border-good/40 bg-good/10 text-good",
  warn: "border-warn/45 bg-warn/10 text-warn",
  accent: "border-accent/40 bg-accent/10 text-accent",
  violet: "border-violet/40 bg-violet/10 text-violet",
  brand: "border-ink/40 bg-white/5 text-ink",
  ink: "border-ink bg-ink text-canvas",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children, dot }: { tone?: Tone; className?: string; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[9.5px] font-medium uppercase tracking-[0.14em] leading-4 whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
