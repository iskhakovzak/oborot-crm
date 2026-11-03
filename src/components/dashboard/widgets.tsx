import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Секция рабочего стола: заголовок, счётчик, ссылка «все», список строк с разделителями */
export function Panel({ title, count, href, hrefLabel = "Все", children, className, empty }: { title: string; count?: number; href?: string; hrefLabel?: string; children?: React.ReactNode; className?: string; empty?: string }) {
  const isEmpty = count === 0 || (count === undefined && !children);
  return (
    <section className={cn("card min-w-0 overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-5 py-3.5">
        <h2 className="text-[14.5px] font-semibold">{title}</h2>
        {count !== undefined && count > 0 && <span className="rounded-full bg-brand-soft px-2 text-[11px] font-medium text-brand-ink tnum">{count}</span>}
        {href && (
          <Link href={href} className="ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand-soft">
            {hrefLabel} <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
      {isEmpty && empty ? <p className="px-5 pb-6 pt-2 text-center text-[13px] text-muted">{empty}</p> : <div className="divide-y divide-line border-t border-line">{children}</div>}
    </section>
  );
}

export function Row({ href, children, className }: { href?: string; children: React.ReactNode; className?: string }) {
  const cls = cn("flex min-w-0 items-center gap-3 px-5 py-3 text-sm [&>*]:min-w-0", href && "transition-colors hover:bg-[#f8f8ff]", className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <div className={cls}>{children}</div>;
}

const tones = {
  accent: "text-accent", good: "text-good", warn: "text-warn", info: "text-info", brand: "text-brand-ink",
} as const;
const chips = {
  accent: "bg-accent-soft text-accent", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", info: "bg-info-soft text-info", brand: "bg-brand-soft text-brand",
} as const;

/** Плитка показателя */
export function Tile({ label, value, sub, tone, href, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: keyof typeof tones; href?: string; icon?: React.ReactNode }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-medium text-muted">{label}</div>
        {icon && <span className={cn("grid size-7 shrink-0 place-items-center rounded-[8px] [&_svg]:size-3.5", tone ? chips[tone] : "bg-surface-3 text-ink-2")}>{icon}</span>}
      </div>
      <div className={cn("mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.02em] tnum", tone ? tones[tone] : "text-ink")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </>
  );
  const cls = "card min-w-0 px-5 py-4";
  if (href) return <Link href={href} className={cn(cls, "block transition-shadow hover:shadow-hover")}>{body}</Link>;
  return <div className={cls}>{body}</div>;
}

export function Tiles({ children, cols = 6, className }: { children: React.ReactNode; cols?: 3 | 4 | 5 | 6; className?: string }) {
  const lg = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols];
  return <div className={cn("mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3", lg, className)}>{children}</div>;
}
