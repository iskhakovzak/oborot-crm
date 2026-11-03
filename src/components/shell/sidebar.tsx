"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";

export function Sidebar({ allowed, user, live }: { allowed: Record<string, boolean>; user: { name: string; color: string; roleName: string }; live: { up: number; total: number } }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-canvas lg:flex">
      <Link href="/" className="flex h-[68px] items-center gap-3 px-5">
        <span className="grid size-[34px] place-items-center rounded-[9px] border border-line-strong bg-ink text-canvas text-[13px] font-bold">W</span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[14px] font-bold tracking-[-0.02em] text-ink">WS_CRM</span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-side-muted">режим оператора</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.entity || allowed[i.entity]);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-2">
              <div className="px-2.5 pb-2 pt-4 text-[10px] font-medium uppercase tracking-[0.22em] text-side-muted">{g.title}</div>
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex h-8 items-center gap-2.5 rounded-[6px] px-2.5 text-[12.5px] transition-colors",
                          active ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-side-text hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <i.icon className={cn("size-[15px]", active ? "text-ink" : "text-side-muted group-hover:text-ink")} />
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
      <div className="border-t border-line px-5 py-3 text-[10px] text-side-muted">
        <Link href="/integrations" className="flex items-center gap-2 hover:text-ink">
          <span className={cn("led", live.up > 0 ? "ok pulse" : "off")} />
          <span>{live.up}/{live.total} систем подключено</span>
        </Link>
        <div className="mt-1 truncate">{user.name} · {user.roleName.toLowerCase()}</div>
      </div>
    </aside>
  );
}
