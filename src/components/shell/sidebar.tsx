"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export function Sidebar({ allowed, user }: { allowed: Record<string, boolean>; user: { name: string; color: string; roleName: string } }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-line bg-side lg:flex">
      <Link href="/" className="flex h-12 items-center gap-2.5 px-4">
        <span className="grid size-6 place-items-center rounded-[6px] bg-ink text-white text-[12px] font-semibold">О</span>
        <span className="text-[13.5px] font-semibold text-ink">Оборот</span>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.entity || allowed[i.entity]);
          if (!items.length) return null;
          return (
            <div key={g.title} className="mb-4">
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium text-side-muted">{g.title}</div>
              <ul className="space-y-px">
                {items.map((i) => {
                  const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className={cn(
                          "group flex h-7 items-center gap-2 rounded-[6px] px-2 text-[13px] transition-colors",
                          active ? "bg-side-2 text-ink font-medium" : "text-side-text hover:bg-side-2/70 hover:text-ink",
                        )}
                      >
                        <i.icon className={cn("size-[15px]", active ? "text-ink" : "text-side-muted group-hover:text-ink-2")} />
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
      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
        <Avatar name={user.name} color={user.color} size={26} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[12.5px] font-medium text-ink">{user.name}</div>
          <div className="truncate text-[11px] text-side-muted">{user.roleName}</div>
        </div>
      </div>
    </aside>
  );
}
