"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Copy, Trash2, FlaskConical, ScrollText, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { deleteAutomation, duplicateAutomation, toggleAutomation } from "@/app/(app)/automations/actions";
import { AutomationEditor } from "./automation-editor";
import { TestRunDialog } from "./test-run-dialog";
import { actionSummary, describeCondition, type AutomationRow, type Labels, type Option } from "./types";

export function AutomationList({ rules, users, stages, deals, labels, canEdit, canCreate, canDelete }: { rules: AutomationRow[]; users: Option[]; stages: string[]; deals: Option[]; labels: Labels; canEdit: boolean; canCreate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [editing, setEditing] = useState<AutomationRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<AutomationRow | null>(null);
  const [pending, start] = useTransition();
  const wantNew = sp.get("new") === "1";
  useEffect(() => {
    if (wantNew && canCreate) setCreating(true);
  }, [wantNew, canCreate]);

  function closeCreate(o: boolean) {
    setCreating(o);
    if (!o && wantNew) router.replace("/automations");
  }

  function run(fn: () => Promise<{ error: string } | { ok: true }>, okText: string) {
    start(async () => {
      const r = await fn();
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(okText);
      router.refresh();
    });
  }

  return (
    <>
      {rules.length === 0 ? (
        <EmptyState title="Автоматизаций пока нет" description="Создайте первое правило: при новой заявке — написать клиенту и поставить задачу менеджеру." action={canCreate ? <Button onClick={() => setCreating(true)}>Новая автоматизация</Button> : undefined} />
      ) : (
        <div className={cn("space-y-3", pending && "opacity-70")}>
          {rules.map((r) => (
            <article key={r.id} className={cn("rounded-[12px] border border-line bg-surface transition-colors", !r.isActive && "bg-surface-2/60")}>
              <div className="flex items-start gap-4 px-5 py-4">
                <Switch checked={r.isActive} disabled={!canEdit} onCheckedChange={(v) => run(() => toggleAutomation(r.id, v), v ? "Автоматизация включена" : "Автоматизация выключена")} className="mt-1" aria-label="Включить" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className={cn("text-[15px] font-semibold leading-6", !r.isActive && "text-ink-2")}>{r.name}</h3>
                    {r.description && <span className="text-xs text-muted">{r.description}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="text-muted">Когда</span>
                    <Badge tone="ink"><Zap className="size-3" /> {labels.events[r.event]}</Badge>
                    {r.conditions.length > 0 && (
                      <>
                        <span className="text-muted">если</span>
                        {r.conditions.map((c, i) => (
                          <Badge key={i} tone="warn">{describeCondition(c)}</Badge>
                        ))}
                      </>
                    )}
                    <span className="text-muted">→</span>
                    {r.actions.map((a, i) => {
                      const s = actionSummary(a);
                      return (
                        <Badge key={i} tone="info">
                          {labels.actions[a.type]}
                          {s && <span className="font-normal opacity-75">· {s}</span>}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-muted sm:block">
                  <div className="text-[15px] font-semibold text-ink tnum">{r.runsCount}</div>
                  <div>запусков</div>
                  <div className="mt-1">{r.lastRunAt ? `последний ${r.lastRunLabel}` : "ещё не запускалась"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canEdit && (
                    <Button variant="secondary" size="sm" onClick={() => setTesting(r)}><FlaskConical /> Проверить</Button>
                  )}
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="iconSm" aria-label="Действия"><MoreHorizontal /></Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      {canEdit && <DropdownItem onSelect={() => setEditing(r)}><Pencil /> Изменить</DropdownItem>}
                      <DropdownItem asChild><Link href={`/automations/${r.id}`}><ScrollText /> Журнал запусков</Link></DropdownItem>
                      {canCreate && <DropdownItem onSelect={() => run(() => duplicateAutomation(r.id), "Копия создана (выключена)")}><Copy /> Дублировать</DropdownItem>}
                      {canDelete && (
                        <>
                          <DropdownSeparator />
                          <DropdownItem danger onSelect={() => { if (confirm(`Удалить автоматизацию «${r.name}»?`)) run(() => deleteAutomation(r.id), "Автоматизация удалена"); }}><Trash2 /> Удалить</DropdownItem>
                        </>
                      )}
                    </DropdownContent>
                  </Dropdown>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <AutomationEditor open={creating} onOpenChange={closeCreate} rule={null} users={users} stages={stages} labels={labels} />
      <AutomationEditor open={!!editing} onOpenChange={(o) => !o && setEditing(null)} rule={editing} users={users} stages={stages} labels={labels} />
      <TestRunDialog rule={testing} onOpenChange={(o) => !o && setTesting(null)} deals={deals} eventLabels={labels.events} />
    </>
  );
}
