import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Сумма в сумах одной строкой. `compact` — для узких мест (плитки, карточки, бейджи, узкие колонки):
 * от 1 млн показывает «17,3 млн сум», полная сумма — в подсказке (title).
 */
export function Money({ value, compact, className, title }: { value: number | null | undefined; compact?: boolean; className?: string; title?: string }) {
  const full = fmtMoney(value);
  const text = compact ? fmtMoneyShort(value) : full;
  return (
    <span className={cn("tnum whitespace-nowrap", className)} title={title ?? (text !== full ? full : undefined)}>
      {text}
    </span>
  );
}
