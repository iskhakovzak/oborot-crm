import Link from "next/link";
import { cn } from "@/lib/utils";

/** Вкладки-ссылки (?tab=) для серверных страниц: без клиентского состояния */
export function LinkTabs({ items, active, className }: { items: { key: string; label: string; href: string; count?: number; tone?: "accent" }[]; active: string; className?: string }) {
  return (
    <div className={cn("inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1", className)}>
      {items.map((i) => {
        const on = i.key === active;
        return (
          <Link
            key={i.key}
            href={i.href}
            className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-colors", on ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
          >
            {i.label}
            {i.count !== undefined && i.count > 0 && <span className={cn("rounded-full px-1.5 text-[11px] tnum", i.tone === "accent" ? "bg-accent-soft text-accent" : "bg-black/5 text-muted")}>{i.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}
