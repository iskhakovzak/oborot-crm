"use client";
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Building2, KanbanSquare, FileText, User, Search } from "lucide-react";
import { NAV } from "./nav";

type Hit = { type: "company" | "deal" | "document" | "contact"; id: string; title: string; subtitle?: string; href: string };
const icons = { company: Building2, deal: KanbanSquare, document: FileText, contact: User };

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (!q.trim()) return setHits([]);
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      setHits(await r.json());
    }, 120);
    return () => clearTimeout(t);
  }, [q, open]);
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[14px] bg-surface shadow-pop outline-none rise">
          <DialogPrimitive.Title className="sr-only">Поиск</DialogPrimitive.Title>
          <Command shouldFilter={false} label="Поиск">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Клиент, сделка, документ, ИНН, телефон…" className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted" />
            </div>
            <Command.List className="max-h-[50vh] overflow-y-auto p-2">
              {q.trim() ? (
                hits.length ? (
                  <Command.Group heading={<div className="px-2 py-1 text-xs text-muted">Результаты</div>}>
                    {hits.map((h) => {
                      const I = icons[h.type];
                      return (
                        <Command.Item key={h.type + h.id} value={h.type + h.id} onSelect={() => go(h.href)} className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 text-sm data-[selected=true]:bg-surface-2">
                          <I className="size-4 text-muted" />
                          <span className="font-medium">{h.title}</span>
                          {h.subtitle && <span className="text-muted">{h.subtitle}</span>}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-muted">Ничего не найдено</div>
                )
              ) : (
                <Command.Group heading={<div className="px-2 py-1 text-xs text-muted">Разделы</div>}>
                  {NAV.flatMap((g) => g.items).map((i) => (
                    <Command.Item key={i.href} value={i.href} onSelect={() => go(i.href)} className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-2 text-sm data-[selected=true]:bg-surface-2">
                      <i.icon className="size-4 text-muted" />
                      {i.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
