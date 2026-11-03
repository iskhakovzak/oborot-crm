"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export function Sidebar({ allowed, user }: { allowed: Record<string, boolean>; user: { name: string; color: string; roleName: string } }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-side-gradient text-side-text lg:flex">
      <Link href="/" className="flex h-16 items-center gap-3 px-5">
        <span className="grid size-9 place-items-center rounded-[11px] bg-brand-gradient text-white text-[15px] font-bold shadow-brand">О</span>
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold text-white tracking-[-0.01em]">Оборот</span>
          <span className="text-[11px] text-side-muted">CRM для продаж и отгрузки</span>
        </span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.entity || allowed[i.entity]);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-5">
              <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-side-muted/80">{g.title}</div>
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className={cn(
                          "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors",
                          active ? "bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-side-text hover:bg-white/[0.05] hover:text-white",
                        )}
                      >
                        {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-2" />}
                        <i.icon className={cn("size-[17px]", active ? "text-brand-2" : "text-side-muted group-hover:text-side-text")} />
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
      <div className="m-3 flex items-center gap-3 rounded-[12px] bg-white/[0.05] px-3 py-2.5">
        <Avatar name={user.name} color={user.color} size={32} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-medium text-white">{user.name}</div>
          <div className="truncate text-[11.5px] text-side-muted">{user.roleName}</div>
        </div>
      </div>
    </aside>
  );
}
