"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, MoreHorizontal, Pencil, CalendarClock, CalendarPlus, RotateCcw, Trash2, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { completeTask, deleteTask, reopenTask, rescheduleTask, updateTask } from "@/app/(app)/tasks/actions";
import { TaskDialog } from "./task-dialog";
import { SOURCE_LABELS, type Option, type TaskGroup, type TaskRowData } from "./types";

const SOURCE_TONE: Record<TaskRowData["source"], Tone> = { manual: "neutral", automation: "info", telegram: "violet", ai: "good" };
const PRIORITY_DOT: Record<TaskRowData["priority"], string> = { high: "bg-accent", normal: "bg-info", low: "bg-line-strong" };

export function TaskList({ groups, users, deals, companies, currentUserId, canCreate, emptyTitle, emptyText }: { groups: TaskGroup[]; users: Option[]; deals: Option[]; companies: Option[]; currentUserId: string; canCreate: boolean; emptyTitle: string; emptyText: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [editing, setEditing] = useState<TaskRowData | null>(null);
  const [createOpen, setCreateOpen] = useState(sp.get("new") === "1");
  const total = groups.reduce((s, g) => s + g.tasks.length, 0);
  const wantNew = sp.get("new") === "1";
  useEffect(() => {
    if (wantNew) setCreateOpen(true);
  }, [wantNew]);

  function closeCreate(o: boolean) {
    setCreateOpen(o);
    if (!o && sp.get("new")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      router.replace(`/tasks${next.size ? `?${next}` : ""}`);
    }
  }

  return (
    <>
      {total === 0 ? (
        <EmptyState title={emptyTitle} description={emptyText} action={canCreate ? <Button onClick={() => setCreateOpen(true)}>Новая задача</Button> : undefined} />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-1.5 flex items-baseline gap-2 px-1">
                <h2 className={cn("text-[13px] font-semibold", g.key === "overdue" ? "text-accent" : "text-ink-2")}>{g.title}</h2>
                <span className="text-xs text-muted tnum">{g.tasks.length}</span>
              </div>
              <div className="divide-y divide-line rounded-[12px] border border-line bg-surface">
                {g.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} users={users} onEdit={() => setEditing(t)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <TaskDialog open={createOpen} onOpenChange={closeCreate} users={users} deals={deals} companies={companies} currentUserId={currentUserId} />
      <TaskDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} task={editing} users={users} deals={deals} companies={companies} currentUserId={currentUserId} />
    </>
  );
}

export function TaskRow({ task, users, onEdit, compact }: { task: TaskRowData; users: Option[]; onEdit?: () => void; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(task.status === "done");

  function run(fn: () => Promise<{ error: string } | { ok: true }>, okText?: string) {
    start(async () => {
      const r = await fn();
      if ("error" in r) { toast.error(r.error); return; }
      if (okText) toast.success(okText);
      router.refresh();
    });
  }

  function toggle() {
    if (!task.canEdit) return toast.error("Нет прав на изменение этой задачи");
    const next = !done;
    setDone(next);
    run(() => (next ? completeTask(task.id) : reopenTask(task.id)), next ? "Задача выполнена" : "Задача снова открыта");
  }

  return (
    <div className={cn("group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2", pending && "opacity-60")}>
      <button
        type="button"
        onClick={toggle}
        aria-label={done ? "Открыть задачу" : "Выполнить задачу"}
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
          done ? "border-good bg-good text-canvas" : "border-line-strong bg-surface hover:border-ink",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>
      <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority])} title={`Приоритет: ${task.priority === "high" ? "высокий" : task.priority === "low" ? "низкий" : "обычный"}`} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium", done && "text-muted line-through")}>{task.title}</div>
        {(task.dealTitle || task.companyName || (!compact && task.description)) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {task.dealId && task.dealTitle && (
              <Link href={`/deals/${task.dealId}`} className="truncate hover:text-ink hover:underline">{task.dealTitle}</Link>
            )}
            {task.dealTitle && task.companyName && <span>·</span>}
            {task.companyId && task.companyName && (
              <Link href={`/companies/${task.companyId}`} className="truncate hover:text-ink hover:underline">{task.companyName}</Link>
            )}
            {!compact && task.description && !task.dealTitle && !task.companyName && <span className="truncate">{task.description}</span>}
          </div>
        )}
      </div>
      {!compact && (
        <Badge tone={SOURCE_TONE[task.source]} className="hidden sm:inline-flex">{SOURCE_LABELS[task.source]}</Badge>
      )}
      <div className={cn("w-[112px] shrink-0 text-right text-xs tnum", task.overdue && !done ? "font-medium text-accent" : "text-muted")} title={task.dueExact}>
        {done ? task.completedLabel : task.dueLabel}
      </div>
      {task.assigneeName ? <Avatar name={task.assigneeName} color={task.assigneeColor ?? undefined} size={24} /> : <span className="size-6 rounded-full border border-dashed border-line-strong" />}
      {!compact && (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="Действия" className="text-muted">
              <MoreHorizontal />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            {task.canEdit && (
              <>
                <DropdownItem onSelect={onEdit}><Pencil /> Редактировать</DropdownItem>
                <DropdownItem onSelect={() => run(() => rescheduleTask(task.id, "tomorrow"), "Перенесено на завтра")}><CalendarClock /> Перенести на завтра</DropdownItem>
                <DropdownItem onSelect={() => run(() => rescheduleTask(task.id, "plus1"), "Срок сдвинут на день")}><CalendarPlus /> Сдвинуть на +1 день</DropdownItem>
                <DropdownItem onSelect={() => run(() => rescheduleTask(task.id, "week"), "Перенесено на неделю")}><CalendarPlus /> Перенести на неделю</DropdownItem>
                <DropdownSeparator />
                <DropdownLabel>Переназначить</DropdownLabel>
                {users.filter((u) => u.id !== task.assigneeId).slice(0, 8).map((u) => (
                  <DropdownItem key={u.id} onSelect={() => run(() => updateTask(task.id, { assigneeId: u.id }), `Назначено: ${u.name}`)}><UserRound /> {u.name}</DropdownItem>
                ))}
                {done && (
                  <>
                    <DropdownSeparator />
                    <DropdownItem onSelect={toggle}><RotateCcw /> Открыть заново</DropdownItem>
                  </>
                )}
              </>
            )}
            {task.canDelete && (
              <>
                <DropdownSeparator />
                <DropdownItem danger onSelect={() => run(() => deleteTask(task.id), "Задача удалена")}><Trash2 /> Удалить</DropdownItem>
              </>
            )}
            {!task.canEdit && !task.canDelete && <DropdownLabel>Только просмотр</DropdownLabel>}
          </DropdownContent>
        </Dropdown>
      )}
    </div>
  );
}
