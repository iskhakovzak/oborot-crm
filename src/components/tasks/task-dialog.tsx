"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createTask, updateTask } from "@/app/(app)/tasks/actions";
import { PRIORITY_LABELS, toLocalInput, type Option, type TaskRowData } from "./types";

export type TaskDialogProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: TaskRowData | null;
  users: Option[];
  deals: Option[];
  companies: Option[];
  currentUserId: string;
  defaults?: { dealId?: string | null; companyId?: string | null };
};

export function TaskDialog({ open, onOpenChange, task, users, deals, companies, currentUserId, defaults }: TaskDialogProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [dealId, setDealId] = useState("");
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssigneeId(task?.assigneeId ?? currentUserId);
    setDueAt(toLocalInput(task?.dueAt ?? null) || (task ? "" : defaultDue()));
    setPriority(task?.priority ?? "normal");
    setDealId(task?.dealId ?? defaults?.dealId ?? "");
    setCompanyId(task?.companyId ?? defaults?.companyId ?? "");
  }, [open, task, currentUserId, defaults]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const input = { title, description, assigneeId: assigneeId || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null, priority, dealId: dealId || null, companyId: companyId || null };
      const r = task ? await updateTask(task.id, input) : await createTask(input);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(task ? "Задача обновлена" : "Задача создана");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={task ? "Редактировать задачу" : "Новая задача"} description={task ? undefined : "Задача появится у исполнителя на рабочем столе и в списке задач"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Название">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Позвонить клиенту и уточнить сроки" required autoFocus />
          </Field>
          <Field label="Описание">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Что именно нужно сделать" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Исполнитель">
              <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Приоритет">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}>
                {(Object.keys(PRIORITY_LABELS) as (keyof typeof PRIORITY_LABELS)[]).map((k) => (
                  <option key={k} value={k}>{PRIORITY_LABELS[k]}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Срок" hint="Без срока задача попадёт в группу «Без срока»">
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сделка">
              <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
                <option value="">— не связана —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Клиент">
              <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— не связан —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{task ? "Сохранить" : "Создать задачу"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaultDue() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
}
