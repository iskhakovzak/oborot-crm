"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";

export function MobileNav({ allowed }: { allowed: Record<string, boolean> }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button className="lg:hidden rounded-md p-1.5 text-ink-2 hover:bg-surface-2" aria-label="Меню">
          <Menu className="size-5" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[260px] overflow-y-auto border-r border-line bg-canvas p-2 shadow-pop outline-none lg:hidden">
          <DialogPrimitive.Title className="sr-only">Навигация</DialogPrimitive.Title>
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[15px] font-semibold">WS_CRM</span>
            <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Закрыть"><X className="size-4" /></DialogPrimitive.Close>
          </div>
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
                        <Link href={i.href} onClick={() => setOpen(false)} className={cn("flex h-9 items-center gap-2.5 rounded-[8px] px-2 text-sm", active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2")}>
                          <i.icon className={cn("size-4", active ? "text-ink" : "text-muted")} />
                          {i.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
