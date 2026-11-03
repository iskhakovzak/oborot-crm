import Link from "next/link";
import { cn } from "@/lib/utils";

/** Вкладки-ссылки (состояние в URL) в стиле TabsList */
export function LinkTabs({ items, active, className }: { items: { key: string; label: string; href: string; count?: number }[]; active: string; className?: string }) {
  return (
    <div className={cn("inline-flex h-9 max-w-full items-center gap-1 overflow-x-auto rounded-[9px] bg-black/5 p-1", className)}>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium transition-colors",
            i.key === active ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {i.label}
          {typeof i.count === "number" && <span className={cn("tnum text-xs", i.key === active ? "text-muted" : "text-muted/80")}>{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}
