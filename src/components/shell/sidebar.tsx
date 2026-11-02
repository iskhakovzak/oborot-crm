"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";

export function Sidebar({ allowed }: { allowed: Record<string, boolean> }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-surface lg:flex">
      <Link href="/" className="flex h-14 items-center gap-2.5 px-5 border-b border-line">
        <span className="grid size-7 place-items-center rounded-[8px] bg-ink text-white text-[13px] font-bold">О</span>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">Оборот</span>
        <span className="ml-auto rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent">CRM</span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.entity || allowed[i.entity]);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-4">
              <div className="px-2 pb-1.5 text-[11px] font-medium text-muted">{g.title}</div>
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className={cn(
                          "flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13.5px] transition-colors",
                          active ? "bg-ink text-white" : "text-ink-2 hover:bg-black/5 hover:text-ink",
                        )}
                      >
                        <i.icon className={cn("size-4", active ? "text-white" : "text-muted")} />
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
