"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Settings2, FlaskConical, AlertCircle, ExternalLink } from "lucide-react";
import type { IntegrationKind } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveIntegration, testIntegration, toggleIntegration, type TestResult } from "@/app/(app)/integrations/actions";
import { KIND_HINTS, KIND_ORDER, KIND_TITLES, cardStatus, type ProviderCard } from "./types";

export function IntegrationCatalog({ cards, canEdit }: { cards: ProviderCard[]; canEdit: boolean }) {
  const groups = new Map<string, { title: string; hint?: string; items: ProviderCard[] }>();
  for (const kind of KIND_ORDER) {
    const title = KIND_TITLES[kind];
    const items = cards.filter((c) => c.kind === kind);
    if (!items.length) continue;
    const g = groups.get(title) ?? { title, hint: KIND_HINTS[kind], items: [] };
    g.items.push(...items);
    groups.set(title, g);
  }
  return (
    <div className="space-y-6">
      {[...groups.values()].map((g) => (
        <section key={g.title}>
          <div className="mb-2 flex items-baseline gap-2 px-1">
            <h2 className="text-[14px] font-semibold">{g.title}</h2>
            {g.hint && <span className="text-xs text-muted">{g.hint}</span>}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.items.map((c) => (
              <IntegrationCard key={`${c.kind}:${c.provider}`} card={c} canEdit={canEdit} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function IntegrationCard({ card, canEdit }: { card: ProviderCard; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [test, setTest] = useState<Exclude<TestResult, { error: string }> | null>(null);
  const status = cardStatus(card);

  function toggle(v: boolean) {
    start(async () => {
      const r = await toggleIntegration(card.kind, card.provider, v);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(v ? `${card.name}: включено` : `${card.name}: выключено`);
      router.refresh();
    });
  }
  function runTest() {
    start(async () => {
      const r = await testIntegration(card.kind, card.provider);
      if ("error" in r) { toast.error(`${card.name}: ${r.error}`); router.refresh(); return; }
      setTest(r);
      router.refresh();
    });
  }

  return (
    <article className={cn("flex flex-col rounded-[12px] border border-line bg-surface", !card.isEnabled && "bg-surface-2/60", pending && "opacity-70")}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold">{card.name}</h3>
            <Badge tone={status.tone} dot>{status.label}</Badge>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{card.description}</p>
        </div>
        <Switch checked={card.isEnabled} disabled={!canEdit} onCheckedChange={toggle} aria-label="Включить интеграцию" className="mt-0.5" />
      </div>
      <div className="mt-auto flex items-center gap-2 px-4 pb-3.5 pt-3">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={!canEdit && card.fields.length === 0}>
          <Settings2 /> {canEdit ? "Настроить" : "Поля"}
        </Button>
        <Button variant="ghost" size="sm" onClick={runTest} disabled={pending}><FlaskConical /> Проверить</Button>
        <span className="ml-auto truncate text-[11px] text-muted" title={card.lastError ?? undefined}>
          {card.lastError ? <span className="inline-flex items-center gap-1 text-accent"><AlertCircle className="size-3" /> ошибка</span> : card.lastSyncLabel ? `обмен ${card.lastSyncLabel}` : `${card.filled.length}/${card.fields.length} полей`}
        </span>
      </div>

      <ConfigDialog open={open} onOpenChange={setOpen} card={card} canEdit={canEdit} />

      <Dialog open={!!test} onOpenChange={(o) => !o && setTest(null)}>
        <DialogContent title={test?.title ?? card.name} description={test?.live ? "Ответ получен от провайдера" : "Без ключей всё отработало в демо-режиме — запись добавлена в журнал"}>
          <ul className="space-y-1.5 text-[13px]">
            {(test?.lines ?? []).map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-line-strong" />
                {/^https?:\/\//.test(l) ? <a href={l} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-info hover:underline">{l} <ExternalLink className="size-3" /></a> : <span>{l}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={() => setTest(null)}>Закрыть</Button></div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function ConfigDialog({ open, onOpenChange, card, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; card: ProviderCard; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setValues(Object.fromEntries(card.fields.map((f) => [f.key, f.secret ? "" : card.config[f.key] ?? ""])));
  }, [open, card]);
  const required = card.fields.filter((f) => !f.hint);
  const willConnect = required.every((f) => (values[f.key] ?? "").trim() || (f.secret && card.filled.includes(f.key)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveIntegration(card.kind, card.provider, values, true);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(r.status === "connected" ? `${card.name}: подключено` : `${card.name}: сохранено, работает в демо-режиме`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={card.name} description={card.description}>
        <form onSubmit={submit} className="space-y-4">
          {card.fields.length === 0 && <p className="text-[13px] text-muted">У этого провайдера нет настроек.</p>}
          {card.fields.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint ?? (f.secret && card.filled.includes(f.key) ? "Значение сохранено. Оставьте пустым, чтобы не менять" : undefined)}>
              <Input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.secret && card.filled.includes(f.key) ? "••••••••" : f.placeholder}
                disabled={!canEdit}
              />
            </Field>
          ))}
          <div className={cn("rounded-[8px] px-3 py-2 text-[13px]", willConnect ? "bg-good-soft text-good" : "bg-warn-soft text-warn")}>
            {willConnect ? "Все обязательные поля заполнены — после сохранения статус «Подключено»." : "Без обязательных полей интеграция работает в демо-режиме: действия логируются, наружу ничего не уходит."}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            {canEdit && card.fields.length > 0 && <Button type="submit" disabled={pending}>Сохранить</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { IntegrationKind };
