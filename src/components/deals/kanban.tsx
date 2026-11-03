"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { plural } from "@/lib/format";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import { moveDealStage } from "@/app/(app)/deals/actions";
import type { KanbanDeal, StageInfo } from "./types";

function DealCard({ deal, dragging, overlay }: { deal: KanbanDeal; dragging?: boolean; overlay?: boolean }) {
  return (
    <div
      className={cn(
        "group card rounded-[8px] px-3 py-2.5",
        deal.canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        dragging && "opacity-30",
        overlay && "rotate-[1.5deg] border-line-strong shadow-pop",
        !overlay && "hover:-translate-y-px",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/deals/${deal.id}`} className="min-w-0 text-[13.5px] font-medium leading-5 hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          <span className="line-clamp-2">{deal.title}</span>
        </Link>
        <span className="shrink-0 text-[11px] text-muted tnum">№{deal.number}</span>
      </div>
      {deal.companyName && <div className="mt-0.5 truncate text-[12.5px] text-ink-2">{deal.companyName}</div>}
      {deal.amount !== null && <div className="mt-1.5 truncate text-[14px] font-semibold"><Money value={deal.amount} compact /></div>}
      <div className="mt-2 flex items-center gap-2">
        {deal.managerName ? <Avatar name={deal.managerName} color={deal.managerColor ?? undefined} size={22} /> : <span className="grid size-[22px] place-items-center rounded-full border border-dashed border-line-strong text-[10px] text-muted">?</span>}
        <span className={cn("text-[11.5px] tnum", deal.daysOnStage > 7 && deal.status === "open" ? "text-warn" : "text-muted")}>{deal.daysOnStage === 0 ? "сегодня" : plural(deal.daysOnStage, "день", "дня", "дней")}</span>
        {deal.source && <Badge className="ml-auto max-w-[120px] truncate px-1.5 py-0 text-[11px]">{deal.source}</Badge>}
      </div>
    </div>
  );
}

function DraggableCard({ deal }: { deal: KanbanDeal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id, disabled: !deal.canEdit });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} {...listeners} {...attributes}>
      <DealCard deal={deal} dragging={isDragging} />
    </div>
  );
}

function Column({ stage, deals, hideAmount, active }: { stage: StageInfo; deals: KanbanDeal[]; hideAmount: boolean; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = deals.reduce((s, d) => s + (d.amount ?? 0), 0);
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="size-2 rounded-full" style={{ background: stage.color }} />
        <span className="min-w-0 truncate text-[13px] font-semibold">{stage.name}</span>
        <span className="shrink-0 rounded-full bg-black/5 px-1.5 text-[11px] text-ink-2 tnum">{deals.length}</span>
        {!hideAmount && <span className="ml-auto shrink-0 text-[12px] text-muted"><Money value={sum} compact /></span>}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[160px] flex-1 flex-col gap-2 rounded-[10px] border p-2 transition-colors",
          isOver ? "border-ink bg-surface-2" : active ? "border-dashed border-line-strong bg-canvas" : "border-line bg-canvas",
        )}
      >
        {deals.map((d) => (
          <DraggableCard key={d.id} deal={d} />
        ))}
        {!deals.length && <div className="grid flex-1 place-items-center rounded-[8px] text-[12px] text-muted">{active ? "Перетащите сюда" : "Пусто"}</div>}
      </div>
    </div>
  );
}

export function Kanban({ stages, deals: initial, hideAmount }: { stages: StageInfo[]; deals: KanbanDeal[]; hideAmount: boolean }) {
  const [deals, setDeals] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byStage = useMemo(() => {
    const m = new Map<string, KanbanDeal[]>();
    for (const s of stages) m.set(s.id, []);
    for (const d of deals) m.get(d.stageId)?.push(d);
    return m;
  }, [deals, stages]);
  const active = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || !stageId || deal.stageId === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    const prev = deals;
    setDeals((ds) => ds.map((d) => (d.id === dealId ? { ...d, stageId, daysOnStage: 0, status: stage?.kind ?? d.status } : d)));
    startTransition(async () => {
      const r = await moveDealStage(dealId, stageId);
      if ("error" in r) {
        setDeals(prev);
        toast.error(r.error);
        return;
      }
      if (r.status === "won") toast.success(`Сделка №${deal.number} выиграна`);
      else if (r.status === "lost") toast(`Сделка №${deal.number} закрыта как проигранная`);
      router.refresh();
    });
  }

  return (
    <DndContext id="deals-kanban" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex min-h-[560px] gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {stages.map((s) => (
          <Column key={s.id} stage={s} deals={byStage.get(s.id) ?? []} hideAmount={hideAmount} active={!!activeId} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <div className="w-[256px]"><DealCard deal={active} overlay /></div> : null}</DragOverlay>
    </DndContext>
  );
}
