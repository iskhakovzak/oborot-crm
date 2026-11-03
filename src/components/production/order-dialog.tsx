"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { updateProductionOrder } from "@/app/(app)/production/actions";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { ORDER_STATUS, type ProdOrder, type ProdUser } from "./types";

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export function OrderDialog({ order, users, open, onOpenChange, canEdit, showAmount }: { order: ProdOrder | null; users: ProdUser[]; open: boolean; onOpenChange: (o: boolean) => void; canEdit: boolean; showAmount: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [assigneeId, setAssigneeId] = useState("");
  const [plannedAt, setPlannedAt] = useState("");
  const [qty, setQty] = useState("1");
  const [defects, setDefects] = useState("0");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!order) return;
    setAssigneeId(order.assigneeId ?? ""); setPlannedAt(toLocalInput(order.plannedAt)); setQty(String(order.qty)); setDefects(String(order.defects)); setNotes(order.notes ?? "");
  }, [order]);
  if (!order) return null;
  const prod = users.filter((u) => u.teamId === "production");
  const others = users.filter((u) => u.teamId !== "production");
  const save = () =>
    start(async () => {
      const r = await updateProductionOrder(order.id, { assigneeId: assigneeId || null, plannedAt: plannedAt || null, qty: Number(qty), defects: Number(defects), notes });
      if (r.ok) { toast.success(r.message); onOpenChange(false); router.refresh(); } else toast.error(r.error);
    });
  const st = ORDER_STATUS[order.status];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Заказ №${order.number}`} description={order.title}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Badge tone={st.tone} dot>{st.label}</Badge>
            {order.companyId && <Link href={`/companies/${order.companyId}`} className="hover:underline">{order.companyName}</Link>}
            {order.dealId && <><span className="text-muted">·</span><Link href={`/deals/${order.dealId}`} className="hover:underline">Сделка №{order.dealNumber}</Link></>}
            {showAmount && order.dealAmount != null && <><span className="text-muted">·</span><span className="tnum">{fmtMoney(order.dealAmount)}</span></>}
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-[10px] bg-surface-2 p-3 text-[13px]">
            <div><div className="text-muted text-xs">Создан</div>{fmtDateTime(order.createdAt)}</div>
            <div><div className="text-muted text-xs">Старт</div>{order.startedAt ? fmtDateTime(order.startedAt) : "—"}</div>
            <div><div className="text-muted text-xs">Финиш</div>{order.finishedAt ? fmtDateTime(order.finishedAt) : "—"}</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Исполнитель">
              <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={!canEdit}>
                <option value="">Не назначен</option>
                {prod.length > 0 && <optgroup label="Производство">{prod.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>}
                {others.length > 0 && <optgroup label="Остальные сотрудники">{others.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>}
              </Select>
            </Field>
            <Field label="Плановая дата"><Input type="datetime-local" value={plannedAt} onChange={(e) => setPlannedAt(e.target.value)} disabled={!canEdit} /></Field>
            <Field label="Количество"><Input type="number" min={0} step="1" value={qty} onChange={(e) => setQty(e.target.value)} disabled={!canEdit} className="tnum" /></Field>
            <Field label="Брак, шт"><Input type="number" min={0} step="1" value={defects} onChange={(e) => setDefects(e.target.value)} disabled={!canEdit} className="tnum" /></Field>
          </div>
          <Field label="Заметки"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Состав заказа, особенности, материалы…" /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Закрыть</Button>
            {canEdit && <Button onClick={save} disabled={pending}>{pending && <Loader2 className="animate-spin" />} Сохранить</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Кнопка «Открыть» для списка */
export function OrderDialogButton({ order, users, canEdit, showAmount }: { order: ProdOrder; users: ProdUser[]; canEdit: boolean; showAmount: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Открыть</Button>
      <OrderDialog order={order} users={users} open={open} onOpenChange={setOpen} canEdit={canEdit} showAmount={showAmount} />
    </>
  );
}
