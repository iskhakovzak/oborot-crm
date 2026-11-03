"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CalendarClock, AlertTriangle, Package } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { moveProductionOrder } from "@/app/(app)/production/actions";
import { OrderDialog } from "./order-dialog";
import type { ProdOrder, ProdStage, ProdUser } from "./types";

function Card({ order, onOpen, dragging, overlay }: { order: ProdOrder; onOpen?: () => void; dragging?: boolean; overlay?: boolean }) {
  const overdue = order.plannedAt && order.status !== "done" && order.plannedAt < new Date().toISOString();
  return (
    <div
      onClick={onOpen}
      className={cn("rounded-[10px] border border-line bg-surface p-3 text-[13px] cursor-grab active:cursor-grabbing select-none transition-shadow", dragging && "opacity-40", overlay && "shadow-pop rotate-[1.5deg]", !overlay && "hover:border-line-strong")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted tnum">№{order.number}</span>
        {order.assigneeName ? <Avatar name={order.assigneeName} color={order.assigneeColor ?? undefined} size={22} /> : <span className="size-[22px] rounded-full border border-dashed border-line-strong" title="Не назначен" />}
      </div>
      <div className="mt-1 font-medium leading-snug line-clamp-2">{order.title}</div>
      {order.companyName && <div className="mt-0.5 text-xs text-muted truncate">{order.companyName}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Package className="size-3.5" />{order.qty} шт</span>
        {order.plannedAt && <span className={cn("inline-flex items-center gap-1", overdue && "text-accent")}><CalendarClock className="size-3.5" />{fmtDate(order.plannedAt)}</span>}
        {order.defects > 0 && <Badge tone="accent" className="px-1.5 py-0 text-[11px] leading-4"><AlertTriangle className="size-3" /> брак {order.defects}</Badge>}
      </div>
    </div>
  );
}

function DraggableCard({ order, onOpen, canEdit }: { order: ProdOrder; onOpen: () => void; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: order.id, disabled: !canEdit });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} data-order={order.number}>
      <Card order={order} onOpen={onOpen} dragging={isDragging} />
    </div>
  );
}

function Column({ stage, orders, onOpen, canEdit }: { stage: ProdStage; orders: ProdOrder[]; onOpen: (o: ProdOrder) => void; canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} data-stage={stage.name} className={cn("flex min-h-[420px] w-[280px] shrink-0 flex-col rounded-[12px] border border-line bg-surface-2/60 transition-colors", isOver && "border-info bg-info-soft/40")}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="size-2 rounded-full" style={{ background: stage.color }} />
        <span className="text-[13px] font-semibold">{stage.name}</span>
        <span className="ml-auto text-xs text-muted tnum">{orders.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {orders.map((o) => <DraggableCard key={o.id} order={o} onOpen={() => onOpen(o)} canEdit={canEdit} />)}
        {orders.length === 0 && <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-line-strong text-xs text-muted">Перетащите заказ</div>}
      </div>
    </div>
  );
}

export function ProductionBoard({ stages, orders: initial, users, canEdit, showAmount }: { stages: ProdStage[]; orders: ProdOrder[]; users: ProdUser[]; canEdit: boolean; showAmount: boolean }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProdOrder | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // при обновлении данных с сервера — синхронизируем локальное состояние
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) { setPrevInitial(initial); setOrders(initial); }
  const byStage = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, orders.filter((o) => o.stageId === s.id)])), [stages, orders]);
  const active = activeId ? orders.find((o) => o.id === activeId) : null;
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    const order = orders.find((o) => o.id === id);
    if (!order || !stageId || order.stageId === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    const last = stages[stages.length - 1];
    const isDone = stage?.kind === "won" || stage?.id === last?.id;
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, stageId, status: isDone ? "done" : stage?.order === 0 ? "queued" : "in_progress" } : o)));
    start(async () => {
      const r = await moveProductionOrder(id, stageId);
      if (r.ok) toast.success(r.message); else { toast.error(r.error); setOrders(initial); }
      router.refresh();
    });
  };
  return (
    <>
      <DndContext id="production-board" sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s) => <Column key={s.id} stage={s} orders={byStage[s.id] ?? []} onOpen={setSelected} canEdit={canEdit} />)}
        </div>
        <DragOverlay>{active ? <div className="w-[264px]"><Card order={active} overlay /></div> : null}</DragOverlay>
      </DndContext>
      <OrderDialog order={selected} users={users} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} canEdit={canEdit} showAmount={showAmount} />
    </>
  );
}
