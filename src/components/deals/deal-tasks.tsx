"use client";
import { useState, useTransition } from "react";
import { Plus, Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addDealTask, toggleDealTask } from "@/app/(app)/deals/actions";

export type TaskRow = { id: string; title: string; status: "open" | "done" | "cancelled"; dueAt: string | null; priority: "low" | "normal" | "high"; assigneeName: string | null };

export function DealTasks({ dealId, tasks, canCreate }: { dealId: string; tasks: TaskRow[]; canCreate: boolean }) {
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const overdue = (t: TaskRow) => t.status === "open" && t.dueAt && new Date(t.dueAt).getTime() < Date.now();
  function add() {
    start(async () => {
      const r = await addDealTask(dealId, title, due ? new Date(due).toISOString() : null);
      if ("error" in r) { toast.error(r.error); return; }
      setTitle(""); setDue("");
    });
  }
  function toggle(id: string) {
    start(async () => {
      const r = await toggleDealTask(id);
      if ("error" in r) toast.error(r.error);
    });
  }
  return (
    <Section title="Задачи" description={tasks.filter((t) => t.status === "open").length ? `${tasks.filter((t) => t.status === "open").length} открытых` : undefined} className="[&>div:last-child]:p-4">
      {canCreate && (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="mb-3 flex gap-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая задача…" className="h-8 text-[13px]" />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-[130px] px-2 text-[13px]" aria-label="Срок" />
          <Button type="submit" size="iconSm" variant="secondary" disabled={pending || !title.trim()} aria-label="Добавить"><Plus /></Button>
        </form>
      )}
      {!tasks.length ? (
        <p className="text-[13px] text-muted">Задач по сделке нет.</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 rounded-[8px] px-1 py-1 hover:bg-surface-2">
              <button type="button" onClick={() => toggle(t.id)} disabled={pending || t.status === "cancelled"} className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", t.status === "done" ? "border-good bg-good text-white" : "border-line-strong text-transparent hover:border-ink")} aria-label={t.status === "done" ? "Вернуть в работу" : "Выполнить"}>
                {t.status === "done" ? <Check className="size-3" /> : <Circle className="size-3" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn("text-[13px] leading-5", t.status !== "open" && "text-muted line-through")}>{t.title}</div>
                <div className={cn("text-[11.5px]", overdue(t) ? "text-accent" : "text-muted")}>
                  {t.dueAt ? `до ${fmtDate(t.dueAt)}` : "без срока"}{t.assigneeName ? ` · ${t.assigneeName}` : ""}{t.priority === "high" ? " · важно" : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
