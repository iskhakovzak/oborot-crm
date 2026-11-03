import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Секция рабочего стола: заголовок, счётчик, ссылка «все», список строк с разделителями */
export function Panel({ title, count, href, hrefLabel = "Все", children, className, empty }: { title: string; count?: number; href?: string; hrefLabel?: string; children?: React.ReactNode; className?: string; empty?: string }) {
  const isEmpty = count === 0 || (count === undefined && !children);
  return (
    <section className={cn("rounded-[12px] border border-line bg-surface", className)}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {count !== undefined && count > 0 && <span className="rounded-full bg-black/5 px-1.5 text-[11px] text-muted tnum">{count}</span>}
        {href && (
          <Link href={href} className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted hover:text-ink">
            {hrefLabel} <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      {isEmpty && empty ? <p className="px-4 py-6 text-center text-[13px] text-muted">{empty}</p> : <div className="divide-y divide-line">{children}</div>}
    </section>
  );
}

export function Row({ href, children, className }: { href?: string; children: React.ReactNode; className?: string }) {
  const cls = cn("flex items-center gap-3 px-4 py-2.5 text-sm", href && "transition-colors hover:bg-surface-2", className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <div className={cls}>{children}</div>;
}

/** Компактная плитка показателя: без лишних рамок внутри общего контейнера */
export function Tile({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "accent" | "good" | "warn" | "info"; href?: string }) {
  const toneCls = tone === "accent" ? "text-accent" : tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "info" ? "text-info" : "text-ink";
  const body = (
    <>
      <div className="text-[12px] text-muted">{label}</div>
      <div className={cn("mt-1 text-[24px] font-semibold leading-7 tracking-[-0.02em] tnum", toneCls)}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </>
  );
  const cls = "min-w-0 bg-surface px-4 py-3.5";
  if (href) return <Link href={href} className={cn(cls, "block transition-colors hover:bg-surface-2")}>{body}</Link>;
  return <div className={cls}>{body}</div>;
}

export function Tiles({ children, cols = 6, className }: { children: React.ReactNode; cols?: 3 | 4 | 5 | 6; className?: string }) {
  const lg = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols];
  return <div className={cn("mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-line bg-line sm:grid-cols-3", lg, className)}>{children}</div>;
}
