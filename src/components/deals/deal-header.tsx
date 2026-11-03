"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Phone, MessageSquare, User, Target, CalendarClock, Hash, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { inputClass } from "@/components/ui/input";
import { fmtMoney, fmtDate, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateDeal, moveDealStage, callDeal, messageDeal, type DealPatch } from "@/app/(app)/deals/actions";
import { InlineText } from "./inline";
import { SOURCES, daysSince, type Option, type StageInfo } from "./types";

export type DealHeaderDeal = {
  id: string; number: number; title: string; amount: number; status: "open" | "won" | "lost"; stageId: string; managerId: string | null; contactId: string | null; companyId: string | null;
  source: string | null; utm: { source?: string; medium?: string; campaign?: string; content?: string; term?: string } | null; ymClientId: string | null; nextStep: string | null; expectedCloseAt: string | null; lostReason: string | null;
  createdAt: string; stageEnteredAt: string; closedAt: string | null;
};

export function DealHeader({ deal, company, contacts, users, stages, pipelineName, canEdit, hidden, readonly, manager, hasPhone }: {
  deal: DealHeaderDeal; company: { id: string; name: string } | null; contacts: (Option & { phone: string | null })[]; users: (Option & { color: string })[]; stages: StageInfo[]; pipelineName: string;
  canEdit: boolean; hidden: string[]; readonly: string[]; manager: { name: string; color: string } | null; hasPhone: boolean;
}) {
  const [pending, start] = useTransition();
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const stage = stages.find((s) => s.id === deal.stageId);
  const editable = (field: string) => canEdit && !readonly.includes(field) && !hidden.includes(field);

  function save(patch: DealPatch) {
    return new Promise<void>((resolve) => {
      start(async () => {
        const r = await updateDeal(deal.id, patch);
        if ("error" in r) toast.error(r.error);
        resolve();
      });
    });
  }
  function changeStage(stageId: string) {
    start(async () => {
      const r = await moveDealStage(deal.id, stageId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(r.status === "won" ? "Сделка выиграна" : r.status === "lost" ? "Сделка закрыта как проигранная" : "Этап изменён");
    });
  }
  function call() {
    start(async () => {
      const r = await callDeal(deal.id);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Звоним на ${r.phone}${r.sandbox ? " (демо-режим телефонии)" : ""}`);
    });
  }
  function sendMsg() {
    start(async () => {
      const r = await messageDeal(deal.id, msgText);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Отправлено в ${r.channel}${r.sandbox ? " (демо)" : ""}`);
      setMsgText("");
      setMsgOpen(false);
    });
  }

  const statusTone = deal.status === "won" ? "good" : deal.status === "lost" ? "accent" : "info";
  const utmEntries = Object.entries(deal.utm ?? {}).filter(([, v]) => v);

  return (
    <section className="rounded-[12px] border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="tnum">Сделка №{deal.number}</span>
            <span>·</span>
            <span>{pipelineName}</span>
            <Badge tone={statusTone} dot>{deal.status === "won" ? "Выиграна" : deal.status === "lost" ? "Проиграна" : "В работе"}</Badge>
          </div>
          <h1 className="mt-1 text-[22px] font-semibold leading-7 tracking-[-0.01em]">
            <InlineText value={deal.title} onSave={(v) => save({ title: v })} disabled={!editable("title")} inputClassName="text-[20px] font-semibold" />
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13.5px]">
            {!hidden.includes("amount") && (
              <span className="text-[18px] font-semibold tnum">
                <InlineText value={deal.amount} type="number" onSave={(v) => save({ amount: Number(v) })} disabled={!editable("amount")} format={(v) => fmtMoney(Number(v))} inputClassName="w-40 tnum" />
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <Building2 className="size-4 text-muted" />
              {company ? <Link href={`/companies/${company.id}`} className="font-medium text-ink hover:underline">{company.name}</Link> : <span className="text-muted">Клиент не указан</span>}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={call} disabled={pending || !hasPhone} title={hasPhone ? "Позвонить через телефонию" : "Нет телефона"}><Phone /> Позвонить</Button>
          <Button variant="secondary" onClick={() => setMsgOpen(true)} disabled={pending}><MessageSquare /> Написать</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line px-5 py-4 text-[13.5px] md:grid-cols-3 xl:grid-cols-4">
        <Prop icon={<Target />} label="Этап">
          {editable("stageId") ? (
            <select value={deal.stageId} onChange={(e) => changeStage(e.target.value)} disabled={pending} className={cn(inputClass, "h-8 pl-2 text-[13px]")} style={{ borderLeft: `3px solid ${stage?.color ?? "#ccc"}` }}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: stage?.color }} />{stage?.name}</span>
          )}
          <span className="mt-1 block text-xs text-muted">{plural(daysSince(deal.stageEnteredAt), "день", "дня", "дней")} на этапе · вероятность {stage?.probability ?? 0}%</span>
        </Prop>
        <Prop icon={<User />} label="Менеджер">
          {editable("managerId") ? (
            <select value={deal.managerId ?? ""} onChange={(e) => save({ managerId: e.target.value || null })} disabled={pending} className={cn(inputClass, "h-8 text-[13px]")}>
              <option value="">Не назначен</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : manager ? (
            <span className="inline-flex items-center gap-2"><Avatar name={manager.name} color={manager.color} size={22} />{manager.name}</span>
          ) : (
            <span className="text-muted">Не назначен</span>
          )}
        </Prop>
        <Prop icon={<User />} label="Контакт">
          {editable("contactId") && contacts.length ? (
            <select value={deal.contactId ?? ""} onChange={(e) => save({ contactId: e.target.value || null })} disabled={pending} className={cn(inputClass, "h-8 text-[13px]")}>
              <option value="">Не указан</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
              ))}
            </select>
          ) : (
            <span>{contacts.find((c) => c.id === deal.contactId)?.name ?? <span className="text-muted">Не указан</span>}</span>
          )}
        </Prop>
        {!hidden.includes("source") && (
          <Prop icon={<Link2 />} label="Источник">
            {editable("source") ? (
              <select value={deal.source ?? ""} onChange={(e) => save({ source: e.target.value || null })} disabled={pending} className={cn(inputClass, "h-8 text-[13px]")}>
                <option value="">Не указан</option>
                {[...new Set([deal.source, ...SOURCES].filter(Boolean) as string[])].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <span>{deal.source ?? <span className="text-muted">—</span>}</span>
            )}
            {(utmEntries.length > 0 || deal.ymClientId) && (
              <span className="mt-1.5 flex flex-wrap gap-1">
                {utmEntries.map(([k, v]) => (
                  <Badge key={k} className="px-1.5 py-0 text-[11px] font-normal"><span className="text-muted">utm_{k}=</span>{v}</Badge>
                ))}
                {deal.ymClientId && <span title="Яндекс Метрика ClientID"><Badge tone="violet" className="px-1.5 py-0 text-[11px] font-normal tnum"><Hash className="size-3" />{deal.ymClientId}</Badge></span>}
              </span>
            )}
          </Prop>
        )}
        <Prop icon={<Target />} label="Следующий шаг" className="md:col-span-2">
          <InlineText value={deal.nextStep} onSave={(v) => save({ nextStep: v || null })} disabled={!editable("nextStep")} placeholder="Что делаем дальше?" />
        </Prop>
        <Prop icon={<CalendarClock />} label="Ожидаемое закрытие">
          <InlineText value={deal.expectedCloseAt ? deal.expectedCloseAt.slice(0, 10) : ""} type="date" onSave={(v) => save({ expectedCloseAt: v ? new Date(v).toISOString() : null })} disabled={!editable("expectedCloseAt")} format={(v) => fmtDate(String(v), { day: "numeric", month: "long", year: "numeric" })} placeholder="Не задано" />
        </Prop>
        <Prop icon={<CalendarClock />} label="Создана">
          <span>{fmtDate(deal.createdAt, { day: "numeric", month: "long", year: "numeric" })}</span>
          {deal.closedAt && <span className="block text-xs text-muted">закрыта {fmtDate(deal.closedAt)}</span>}
        </Prop>
        {deal.status === "lost" && (
          <Prop icon={<Target />} label="Причина отказа" className="md:col-span-2">
            <InlineText value={deal.lostReason} onSave={(v) => save({ lostReason: v || null })} disabled={!editable("lostReason")} placeholder="Укажите причину" />
          </Prop>
        )}
      </div>

      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent title="Написать клиенту" description="Сообщение уйдёт в канал, где клиент уже переписывался, или в первый заполненный контакт">
          <Field label="Текст">
            <Textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Здравствуйте! По вашей заявке…" autoFocus />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMsgOpen(false)}>Отмена</Button>
            <Button onClick={sendMsg} disabled={pending || !msgText.trim()}>Отправить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Prop({ icon, label, children, className }: { icon: React.ReactNode; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-muted [&_svg]:size-3.5">{icon}{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
