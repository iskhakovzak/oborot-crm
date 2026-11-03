"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CHANNEL_LABEL, COMPANY_STATUS_LABEL, type CampaignChannel, type Segment } from "@/components/campaigns/constants";
import { previewSegmentAction, saveCampaign, type CampaignInput } from "@/app/(app)/campaigns/actions";
import { cn } from "@/lib/utils";
import { plural } from "@/lib/format";

export type CampaignOptions = { tags: string[]; sources: string[]; managers: { id: string; name: string }[]; templateVars: string[] };

function Chips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!options.length) return <span className="text-xs text-muted">Нет вариантов</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:bg-surface-2")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function CampaignForm({ open, options, initial, closeHref = "/campaigns" }: { open: boolean; options: CampaignOptions; initial?: Partial<CampaignInput>; closeHref?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [channel, setChannel] = useState<CampaignChannel>(initial?.channel ?? "telegram");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [segment, setSegment] = useState<Segment>(initial?.segment ?? {});
  const [preview, setPreview] = useState<{ count: number; names: string[] } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // пересчёт получателей при изменении сегмента или канала
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => previewSegmentAction(segment, channel).then(setPreview), 250);
    return () => clearTimeout(t);
  }, [segment, channel, open]);

  const insertVar = (v: string) => {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) return setBody((b) => b + token);
    const s = el.selectionStart ?? body.length, e = el.selectionEnd ?? body.length;
    const next = body.slice(0, s) + token + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };
  const close = () => router.push(closeHref);
  const submit = (send: boolean) =>
    start(async () => {
      const r = await saveCampaign({ id: initial?.id, name, channel, subject, body, segment }, send);
      if (!r.ok) { toast.error(r.error); return; }
      if (send) toast.success(`Рассылка отправлена: ${r.sent ?? 0} получателей`, { description: r.sandbox ? "Демо-режим: провайдер не подключён, доставка имитирована" : undefined });
      else toast.success("Черновик сохранён");
      router.push(`/campaigns/${r.id}`);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent title={initial?.id ? "Рассылка" : "Новая рассылка"} description="Сообщение уйдёт основному контакту каждой компании из сегмента" wide>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
              <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Осеннее ТО со скидкой" autoFocus /></Field>
              <Field label="Канал">
                <Select value={channel} onChange={(e) => setChannel(e.target.value as CampaignChannel)}>
                  {(Object.keys(CHANNEL_LABEL) as CampaignChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
                </Select>
              </Field>
            </div>
            {channel === "email" && <Field label="Тема письма"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Успейте поставить завесы до холодов" /></Field>}
            <Field label="Текст" hint="Подстановки заменятся данными клиента: {{contact.firstName}}, {{client.name}}, {{link.booking}}…">
              <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="{{contact.firstName}}, здравствуйте! …" />
            </Field>
            <div className="flex flex-wrap gap-1">
              {options.templateVars.map((v) => (
                <button key={v} type="button" onClick={() => insertVar(v)} className="rounded-[6px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:border-line-strong hover:text-ink">{`{{${v}}}`}</button>
              ))}
            </div>
          </div>
          <div className="space-y-4 rounded-[10px] border border-line bg-surface-2/60 p-4">
            <div className="text-[13px] font-semibold">Сегмент получателей</div>
            <div className="space-y-1.5"><div className="text-xs text-muted">Статус клиента</div><Chips options={Object.entries(COMPANY_STATUS_LABEL).map(([value, label]) => ({ value, label }))} value={segment.status ?? []} onChange={(v) => setSegment({ ...segment, status: v })} /></div>
            <div className="space-y-1.5"><div className="text-xs text-muted">Теги</div><Chips options={options.tags.map((t) => ({ value: t, label: t }))} value={segment.tags ?? []} onChange={(v) => setSegment({ ...segment, tags: v })} /></div>
            <div className="space-y-1.5"><div className="text-xs text-muted">Менеджер</div><Chips options={options.managers.map((m) => ({ value: m.id, label: m.name }))} value={segment.managerIds ?? []} onChange={(v) => setSegment({ ...segment, managerIds: v })} /></div>
            <div className="space-y-1.5"><div className="text-xs text-muted">Источник</div><Chips options={options.sources.map((s) => ({ value: s, label: s }))} value={segment.source ?? []} onChange={(v) => setSegment({ ...segment, source: v })} /></div>
            <div className="rounded-[8px] border border-line bg-surface p-3 text-[13px]">
              <div className="flex items-center gap-2 font-medium"><Users className="size-4 text-muted" />{preview ? plural(preview.count, "получатель", "получателя", "получателей") : "Считаем…"}</div>
              {preview && preview.names.length > 0 && <div className="mt-1.5 text-xs leading-relaxed text-muted">{preview.names.join(", ")}{preview.count > preview.names.length ? " и другие" : ""}</div>}
              {preview && preview.count === 0 && <div className="mt-1 text-xs text-muted">Нет клиентов с адресом в канале «{CHANNEL_LABEL[channel]}». Смените канал или фильтры.</div>}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={pending}>Отмена</Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={pending}><Save /> Сохранить черновик</Button>
          <Button onClick={() => submit(true)} disabled={pending || !preview?.count}><Send /> Отправить сейчас</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
