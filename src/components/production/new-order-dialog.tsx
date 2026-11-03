"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createProductionOrder } from "@/app/(app)/production/actions";
import type { CompanyOpt, DealForOrder, ProdUser } from "./types";

export function NewOrderDialog({ deals, companies, users }: { deals: DealForOrder[]; companies: CompanyOpt[]; users: ProdUser[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"deal" | "manual">(deals.length ? "deal" : "manual");
  const [q, setQ] = useState("");
  const [dealId, setDealId] = useState(deals[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [qty, setQty] = useState("1");
  const [plannedAt, setPlannedAt] = useState("");
  const [assigneeId, setAssigneeId] = useState(users.find((u) => u.teamId === "production")?.id ?? "");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const filtered = useMemo(() => { const s = q.trim().toLowerCase(); return s ? deals.filter((d) => String(d.number).includes(s) || d.title.toLowerCase().includes(s) || (d.company ?? "").toLowerCase().includes(s)) : deals; }, [deals, q]);
  const effDeal = filtered.some((d) => d.id === dealId) ? dealId : filtered[0]?.id ?? "";
  const submit = () =>
    start(async () => {
      const r = mode === "deal" ? await createProductionOrder({ dealId: effDeal, assigneeId: assigneeId || null, plannedAt: plannedAt || null }) : await createProductionOrder({ title, companyId: companyId || null, qty: Number(qty), plannedAt: plannedAt || null, assigneeId: assigneeId || null, notes });
      if (r.ok) { toast.success(r.message); setOpen(false); setTitle(""); setNotes(""); router.refresh(); } else toast.error(r.error);
    });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Новый заказ</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Новый заказ в производство" description="Из выигранной сделки позиции и клиент переносятся автоматически.">
          <div className="space-y-4">
            <div className="inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1">
              {(["deal", "manual"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`h-7 rounded-[7px] px-3 text-[13px] font-medium transition-colors ${mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}>{m === "deal" ? "Из сделки" : "Вручную"}</button>
              ))}
            </div>
            {mode === "deal" ? (
              <>
                <Field label="Поиск сделки"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="№, название, клиент" /></Field>
                <Field label="Сделка" hint="Показаны выигранные сделки без заказа в производстве">
                  <Select value={effDeal} onChange={(e) => setDealId(e.target.value)} size={Math.min(6, Math.max(3, filtered.length))} className="h-auto py-1 bg-none pr-3">
                    {filtered.map((d) => <option key={d.id} value={d.id}>№{d.number} · {d.title}{d.company ? ` · ${d.company}` : ""}</option>)}
                    {!filtered.length && <option disabled>Нет подходящих сделок</option>}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Название"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Воздуховоды Ø200, 40 м" autoFocus /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Клиент"><Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                  <Field label="Количество"><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="tnum" /></Field>
                </div>
                <Field label="Заметки"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Состав, материалы, особенности" /></Field>
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Исполнитель"><Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">Не назначен</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.teamId === "production" ? "" : " (не производство)"}</option>)}</Select></Field>
              <Field label="Плановая дата"><Input type="datetime-local" value={plannedAt} onChange={(e) => setPlannedAt(e.target.value)} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={submit} disabled={pending || (mode === "deal" ? !effDeal : !title.trim())}>{pending && <Loader2 className="animate-spin" />} Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
