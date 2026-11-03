"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, FlaskConical } from "lucide-react";
import type { DistributionSettings } from "@/lib/settings";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Section } from "@/components/ui/page";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveDistribution, testDistribution } from "@/app/(app)/settings/actions";

type Manager = { id: string; name: string; color: string; weight: number; skills: string[]; open: number };

const MODES: { value: DistributionSettings["mode"]; label: string; hint: string }[] = [
  { value: "round_robin", label: "По кругу", hint: "Заявки раздаются по очереди. Вес менеджера (1–10) — сколько заявок подряд он получает." },
  { value: "least_loaded", label: "Наименее загруженному", hint: "Заявка уходит тому, у кого меньше всего открытых сделок." },
  { value: "by_source", label: "По источнику", hint: "Правило «источник → менеджер». Если правила нет — по кругу." },
  { value: "by_skill", label: "По навыкам", hint: "Теги клиента сопоставляются с навыками менеджеров или с правилами ниже. Если совпадений нет — по кругу." },
];

export function DistributionForm({ initial, managers, sources, canEdit }: { initial: DistributionSettings; managers: Manager[]; sources: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [testSource, setTestSource] = useState(sources[0] ?? "");
  const [testTags, setTestTags] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveDistribution(v);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Правила распределения сохранены");
      router.refresh();
    });
  }
  function runTest() {
    start(async () => {
      const r = await testDistribution({ source: testSource, tags: testTags.split(",").map((s) => s.trim()).filter(Boolean) });
      if ("error" in r) { toast.error(r.error); return; }
      setTestResult(r.name ? `Заявку получит: ${r.name}` : "Некому назначить: нет менеджеров, принимающих заявки");
      router.refresh();
    });
  }
  const toggleManager = (id: string) => setV((x) => ({ ...x, managerIds: x.managerIds.includes(id) ? x.managerIds.filter((m) => m !== id) : [...x.managerIds, id] }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Режим распределения" description="Как новая заявка находит менеджера. Применяется при создании сделки и клиента без явного менеджера">
        <fieldset disabled={!canEdit} className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <label key={m.value} className={cn("flex cursor-pointer gap-3 rounded-[10px] border px-4 py-3 transition-colors", v.mode === m.value ? "border-ink bg-surface" : "border-line hover:border-line-strong")}>
              <input type="radio" name="mode" className="mt-1 accent-ink" checked={v.mode === m.value} onChange={() => setV({ ...v, mode: m.value })} />
              <div>
                <div className="text-[14px] font-medium">{m.label}</div>
                <div className="text-xs text-muted">{m.hint}</div>
              </div>
            </label>
          ))}
        </fieldset>
      </Section>

      <Section title="Участвующие менеджеры" description="Если никто не отмечен — участвуют все, кто принимает заявки (флаг в карточке сотрудника)">
        <fieldset disabled={!canEdit} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {managers.map((m) => (
            <label key={m.id} className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5", v.managerIds.includes(m.id) ? "border-ink" : "border-line")}>
              <input type="checkbox" className="accent-ink" checked={v.managerIds.includes(m.id)} onChange={() => toggleManager(m.id)} />
              <Avatar name={m.name} color={m.color} size={26} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{m.name}</div>
                <div className="truncate text-xs text-muted">вес {m.weight} · {m.open} в работе{m.skills.length ? ` · ${m.skills.join(", ")}` : ""}</div>
              </div>
            </label>
          ))}
          {!managers.length && <p className="text-[13px] text-muted">Нет сотрудников с флагом «Принимает заявки».</p>}
        </fieldset>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Правила по источнику" description="Работают в режиме «По источнику»" action={canEdit && <Button type="button" variant="ghost" size="sm" onClick={() => setV({ ...v, sourceRules: [...v.sourceRules, { source: sources[0] ?? "", managerId: managers[0]?.id ?? "" }] })}><Plus /> Правило</Button>}>
          <div className="space-y-2">
            {v.sourceRules.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <input list="lead-sources" className="flex h-9 w-full rounded-[8px] border border-line-strong bg-surface px-3 text-sm focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20" value={r.source} disabled={!canEdit} onChange={(e) => setV({ ...v, sourceRules: v.sourceRules.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)) })} placeholder="Источник" />
                <Select value={r.managerId} disabled={!canEdit} onChange={(e) => setV({ ...v, sourceRules: v.sourceRules.map((x, j) => (j === i ? { ...x, managerId: e.target.value } : x)) })}>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
                {canEdit && <Button type="button" variant="ghost" size="iconSm" aria-label="Удалить" onClick={() => setV({ ...v, sourceRules: v.sourceRules.filter((_, j) => j !== i) })}><Trash2 /></Button>}
              </div>
            ))}
            {!v.sourceRules.length && <p className="text-[13px] text-muted">Правил нет — заявки с любого источника идут по кругу.</p>}
            <datalist id="lead-sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        </Section>

        <Section title="Правила по навыкам" description="Тег клиента → кто из менеджеров берёт такие заявки" action={canEdit && <Button type="button" variant="ghost" size="sm" onClick={() => setV({ ...v, skillRules: [...v.skillRules, { tag: "", managerIds: [] }] })}><Plus /> Правило</Button>}>
          <div className="space-y-3">
            {v.skillRules.map((r, i) => (
              <div key={i} className="rounded-[8px] border border-line p-3">
                <div className="flex items-center gap-2">
                  <Input value={r.tag} disabled={!canEdit} onChange={(e) => setV({ ...v, skillRules: v.skillRules.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)) })} placeholder="Тег, например «вентиляция»" />
                  {canEdit && <Button type="button" variant="ghost" size="iconSm" aria-label="Удалить" onClick={() => setV({ ...v, skillRules: v.skillRules.filter((_, j) => j !== i) })}><Trash2 /></Button>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {managers.map((m) => {
                    const on = r.managerIds.includes(m.id);
                    return (
                      <button key={m.id} type="button" disabled={!canEdit} onClick={() => setV({ ...v, skillRules: v.skillRules.map((x, j) => (j === i ? { ...x, managerIds: on ? x.managerIds.filter((id) => id !== m.id) : [...x.managerIds, m.id] } : x)) })} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? "border-ink bg-ink text-white" : "border-line text-ink-2 hover:border-line-strong")}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!v.skillRules.length && <p className="text-[13px] text-muted">Правил нет — используются навыки из карточек сотрудников.</p>}
          </div>
        </Section>
      </div>

      <Section title="Уведомление и проверка">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <label className="flex items-center gap-3">
            <Switch checked={v.notifyManager} disabled={!canEdit} onCheckedChange={(notifyManager) => setV({ ...v, notifyManager })} />
            <span>
              <span className="block text-[13px]">Уведомлять менеджера о новой заявке</span>
              <span className="block text-xs text-muted">В Telegram, если привязан, иначе задачей-напоминанием</span>
            </span>
          </label>
          <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-line-strong p-3 lg:w-[460px]">
            <div className="text-[13px] font-medium">Проверить, кому уйдёт заявка</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Источник"><input list="lead-sources" className="flex h-9 w-full rounded-[8px] border border-line-strong bg-surface px-3 text-sm" value={testSource} onChange={(e) => setTestSource(e.target.value)} /></Field>
              <Field label="Теги клиента"><Input value={testTags} onChange={(e) => setTestTags(e.target.value)} placeholder="вентиляция, проекты" /></Field>
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={runTest} disabled={pending}><FlaskConical /> Проверить</Button>
              {testResult && <span className="text-[13px] font-medium">{testResult}</span>}
            </div>
            <span className="text-xs text-muted">Проверка использует сохранённые настройки; в режиме «по кругу» очередь сдвигается.</span>
          </div>
        </div>
      </Section>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>Сохранить распределение</Button>
        </div>
      )}
    </form>
  );
}
