"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import type { AutomationEvent } from "@/db/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, inputClass } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveAutomation } from "@/app/(app)/automations/actions";
import { cn } from "@/lib/utils";
import { CHANNEL_OPTIONS, CONDITION_FIELDS, OP_LABELS, actionToDraft, conditionToDraft, draftToAction, type ActionDraft, type AutomationRow, type ConditionDraft, type Labels, type Option } from "./types";


function defaultAction(type: ActionDraft["type"]): ActionDraft {
  switch (type) {
    case "send_message": return { type, channel: "preferred", template: "{{contact.firstName}}, здравствуйте! " };
    case "send_sms": return { type, template: "" };
    case "send_email": return { type, subject: "", template: "" };
    case "call_client": return { type, script: "" };
    case "create_task": return { type, title: "", assignee: "manager", dueInHours: "24" };
    case "send_invoice": return { type, channel: "preferred" };
    case "send_payment_link": return { type, channel: "preferred" };
    case "handoff": return { type, pipelineKind: "shipping" };
    case "notify_user": return { type, who: "manager", text: "" };
    case "metrika_goal": return { type, goal: "lead" };
    case "move_stage": return { type, stageName: "" };
    default: return { type };
  }
}

export function AutomationEditor({ open, onOpenChange, rule, users, stages, labels }: { open: boolean; onOpenChange: (o: boolean) => void; rule: AutomationRow | null; users: Option[]; stages: string[]; labels: Labels }) {
  const EVENTS = Object.keys(labels.events) as AutomationEvent[];
  const ACTIONS = Object.keys(labels.actions) as ActionDraft["type"][];
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [event, setEvent] = useState<AutomationEvent>("lead.created");
  const [isActive, setIsActive] = useState(true);
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [actions, setActions] = useState<ActionDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? "");
    setDescription(rule?.description ?? "");
    setEvent(rule?.event ?? "lead.created");
    setIsActive(rule?.isActive ?? true);
    setConditions((rule?.conditions ?? []).map(conditionToDraft));
    setActions(rule ? rule.actions.map(actionToDraft) : [defaultAction("send_message")]);
  }, [open, rule]);

  const patchAction = (i: number, p: Partial<ActionDraft>) => setActions((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, dir: -1 | 1) => setActions((xs) => {
    const j = i + dir;
    if (j < 0 || j >= xs.length) return xs;
    const copy = [...xs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveAutomation({
        id: rule?.id ?? null,
        name,
        description,
        event,
        isActive,
        conditions: conditions.map((c) => ({ field: c.field.trim(), op: c.op, value: c.value })),
        actions: actions.map(draftToAction),
      });
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(rule ? "Автоматизация сохранена" : "Автоматизация создана");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={rule ? "Редактировать автоматизацию" : "Новая автоматизация"} description="Когда происходит событие и выполняются условия — система делает действия по порядку">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Название">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая заявка → приветствие и задача менеджеру" required autoFocus />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} /> Включена
            </label>
          </div>
          <Field label="Описание" hint="Например, какие пункты из «30 возможностей» закрывает это правило">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Пункты 1, 19" />
          </Field>

          <div className="rounded-[10px] border border-line">
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">1</span>
              <span className="text-[13px] font-semibold">Когда</span>
            </div>
            <div className="p-4">
              <Field label="Событие">
                <Select value={event} onChange={(e) => setEvent(e.target.value as AutomationEvent)}>
                  {EVENTS.map((ev) => (
                    <option key={ev} value={ev}>{labels.events[ev]}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="rounded-[10px] border border-line">
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">2</span>
              <span className="text-[13px] font-semibold">Если</span>
              <span className="text-xs text-muted">{conditions.length ? "все условия должны выполняться" : "условий нет — правило срабатывает всегда"}</span>
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setConditions((c) => [...c, { field: "deal.amount", op: "gt", value: "" }])}>
                <Plus /> Условие
              </Button>
            </div>
            {conditions.length > 0 && (
              <div className="space-y-2 p-4">
                {conditions.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1.4fr_1fr_1.2fr_auto] items-center gap-2">
                    <input list="automation-fields" className={inputClass} value={c.field} onChange={(e) => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} placeholder="deal.amount" />
                    <Select value={c.op} onChange={(e) => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, op: e.target.value as ConditionDraft["op"] } : x)))}>
                      {(Object.keys(OP_LABELS) as ConditionDraft["op"][]).map((op) => (
                        <option key={op} value={op}>{OP_LABELS[op]}</option>
                      ))}
                    </Select>
                    <Input value={c.value} onChange={(e) => setConditions((xs) => xs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder={c.op === "in" ? "через запятую" : c.field === "deal.stage" || c.field === "toStage" ? "Название этапа" : "Значение"} />
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Удалить условие" onClick={() => setConditions((xs) => xs.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                ))}
                <datalist id="automation-fields">
                  {CONDITION_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </datalist>
                <p className="text-xs text-muted">Поля: {CONDITION_FIELDS.map((f) => f.value).join(", ")}. Для этапов сравнивайте по названию.</p>
              </div>
            )}
          </div>

          <div className="rounded-[10px] border border-line">
            <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <span className="grid size-6 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white">3</span>
              <span className="text-[13px] font-semibold">То</span>
              <span className="text-xs text-muted">действия выполняются по порядку</span>
              <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setActions((a) => [...a, defaultAction("create_task")])}>
                <Plus /> Действие
              </Button>
            </div>
            <div className="divide-y divide-line">
              {actions.map((a, i) => (
                <div key={i} className="space-y-3 p-4">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-muted tnum">{i + 1}.</span>
                    <Select value={a.type} onChange={(e) => patchAction(i, defaultAction(e.target.value as ActionDraft["type"]))} className="flex-1">
                      {ACTIONS.map((t) => (
                        <option key={t} value={t}>{labels.actions[t]}</option>
                      ))}
                    </Select>
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Ниже" disabled={i === actions.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="iconSm" aria-label="Удалить действие" onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </div>
                  <div className="pl-7">
                    <ActionFields a={a} onChange={(p) => patchAction(i, p)} users={users} stages={stages} vars={labels.vars} />
                  </div>
                </div>
              ))}
              {!actions.length && <p className="p-4 text-center text-[13px] text-muted">Добавьте хотя бы одно действие</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={pending}>{rule ? "Сохранить" : "Создать автоматизацию"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChannelSelect({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <Field label="Канал">
      <Select value={value ?? "preferred"} onChange={(e) => onChange(e.target.value)}>
        {CHANNEL_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </Select>
    </Field>
  );
}

/** Шаблон с подстановками {{…}}: кнопки вставляют переменную в позицию курсора */
export function TemplateField({ label, value, onChange, rows = 3, hint, vars: allVars }: { label: string; value?: string; onChange: (v: string) => void; rows?: number; hint?: string; vars: string[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showAll, setShowAll] = useState(false);
  const vars = showAll ? allVars : allVars.slice(0, 9);
  function insert(v: string) {
    const el = ref.current;
    const token = `{{${v}}}`;
    const cur = value ?? "";
    if (!el) return onChange(cur + token);
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    const next = cur.slice(0, s) + token + cur.slice(e);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-2">{label}</span>
      <Textarea ref={ref} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={rows} className="min-h-0" />
      <div className="flex flex-wrap items-center gap-1">
        {vars.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2 hover:border-line-strong hover:text-ink">
            {v}
          </button>
        ))}
        <button type="button" onClick={() => setShowAll((s) => !s)} className="px-1 text-[11px] text-muted hover:text-ink">{showAll ? "скрыть" : `ещё ${allVars.length - 9}`}</button>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function ActionFields({ a, onChange, users, stages, vars }: { a: ActionDraft; onChange: (p: Partial<ActionDraft>) => void; users: Option[]; stages: string[]; vars: string[] }) {
  switch (a.type) {
    case "send_message":
      return (
        <div className="space-y-3">
          <ChannelSelect value={a.channel} onChange={(channel) => onChange({ channel })} />
          <TemplateField vars={vars} label="Текст сообщения" value={a.template} onChange={(template) => onChange({ template })} />
        </div>
      );
    case "send_sms":
      return <TemplateField vars={vars} label="Текст SMS" value={a.template} onChange={(template) => onChange({ template })} rows={2} hint="Короче 160 символов — одно SMS" />;
    case "send_email":
      return (
        <div className="space-y-3">
          <Field label="Тема письма"><Input value={a.subject ?? ""} onChange={(e) => onChange({ subject: e.target.value })} placeholder="Счёт {{invoice.number}} по сделке «{{deal.title}}»" /></Field>
          <TemplateField vars={vars} label="Текст письма" value={a.template} onChange={(template) => onChange({ template })} rows={4} />
        </div>
      );
    case "call_client":
      return <TemplateField vars={vars} label="Сценарий для ИИ-звонка" value={a.script} onChange={(script) => onChange({ script })} rows={2} hint="Что должен выяснить или предложить робот. Пусто — общий сценарий из настроек ИИ" />;
    case "create_task":
      return (
        <div className="space-y-3">
          <TemplateField vars={vars} label="Название задачи" value={a.title} onChange={(title) => onChange({ title })} rows={1} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Исполнитель">
              <Select value={a.assignee ?? "manager"} onChange={(e) => onChange({ assignee: e.target.value })}>
                <option value="manager">Менеджер сделки</option>
                <option value="creator">Кто вызвал событие</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Срок, часов"><Input type="number" min={1} value={a.dueInHours ?? ""} onChange={(e) => onChange({ dueInHours: e.target.value })} /></Field>
          </div>
        </div>
      );
    case "send_invoice":
    case "send_payment_link":
      return <ChannelSelect value={a.channel} onChange={(channel) => onChange({ channel })} />;
    case "handoff":
      return (
        <Field label="Передать в воронку">
          <Select value={a.pipelineKind ?? "shipping"} onChange={(e) => onChange({ pipelineKind: e.target.value })}>
            <option value="shipping">Отгрузка</option>
            <option value="service">Услуги</option>
            <option value="production">Производство</option>
          </Select>
        </Field>
      );
    case "notify_user":
      return (
        <div className="space-y-3">
          <Field label="Кого уведомить">
            <Select value={a.who ?? "manager"} onChange={(e) => onChange({ who: e.target.value })}>
              <option value="manager">Менеджера сделки</option>
              <option value="owner">Владельца (администратора)</option>
            </Select>
          </Field>
          <TemplateField vars={vars} label="Текст" value={a.text} onChange={(text) => onChange({ text })} rows={2} hint="Уйдёт в Telegram сотрудника, при отсутствии привязки — задачей-напоминанием" />
        </div>
      );
    case "metrika_goal":
      return (
        <Field label="Цель в Метрике">
          <div className="flex gap-2">
            <Select value={["lead", "sale"].includes(a.goal ?? "") ? a.goal : "custom"} onChange={(e) => onChange({ goal: e.target.value === "custom" ? "" : e.target.value })} className="w-44">
              <option value="lead">Лид</option>
              <option value="sale">Продажа</option>
              <option value="custom">Своя цель</option>
            </Select>
            {!["lead", "sale"].includes(a.goal ?? "") && <Input value={a.goal ?? ""} onChange={(e) => onChange({ goal: e.target.value })} placeholder="идентификатор цели" />}
          </div>
        </Field>
      );
    case "move_stage":
      return (
        <Field label="Этап воронки продаж">
          <Select value={a.stageName ?? ""} onChange={(e) => onChange({ stageName: e.target.value })}>
            <option value="">— выберите этап —</option>
            {stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
      );
    case "send_to_edo":
      return <p className={cn("text-xs text-muted")}>Документ из события (УПД, акт, счёт) уйдёт контрагенту через подключённый ЭДО-провайдер.</p>;
    case "ai_reply":
      return <p className="text-xs text-muted">ИИ ответит в переписке по базе знаний из настроек ИИ-помощника и передаст менеджеру по правилу передачи.</p>;
    case "sync_finance":
      return <p className="text-xs text-muted">Оплата или документ из события будут отправлены в подключённый финучёт (1С, Финолог, ПланФакт).</p>;
  }
}
