"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Bot, FileText, Phone, FlaskConical, Loader2, ChevronDown, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateTime, phoneFmt } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { Input, Select, Field } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/page";
import { callAction, setCallStatus, simulateIncomingCall } from "@/app/(app)/calls/actions";

export type CallItem = {
  id: string; direction: "in" | "out"; phone: string; status: "queued" | "ringing" | "answered" | "missed" | "busy" | "completed" | "ai_handled"; durationSec: number; startedAt: string; aiHandled: boolean;
  transcript: string | null; aiSummary: string | null; recordingUrl: string | null; provider: string;
  contactId: string | null; contactName: string | null; companyId: string | null; companyName: string | null; userName: string | null; userColor: string | null; dealId: string | null; dealTitle: string | null;
};
type ContactItem = { id: string; name: string; phone: string; company: string | null };

const STATUS: Record<CallItem["status"], { label: string; tone: Tone }> = {
  queued: { label: "В очереди", tone: "neutral" },
  ringing: { label: "Звоним", tone: "info" },
  answered: { label: "Разговор", tone: "info" },
  missed: { label: "Пропущен", tone: "accent" },
  busy: { label: "Занято", tone: "warn" },
  completed: { label: "Состоялся", tone: "good" },
  ai_handled: { label: "Принял ИИ", tone: "violet" },
};
const FILTERS = [["all", "Все"], ["in", "Входящие"], ["out", "Исходящие"], ["missed", "Пропущенные"], ["ai", "ИИ"]] as const;

function dur(s: number) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CallsView({ calls, contacts, canCreate, canEdit, aiCallsEnabled, assistantName }: { calls: CallItem[]; contacts: ContactItem[]; canCreate: boolean; canEdit: boolean; aiCallsEnabled: boolean; assistantName: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [callOpen, setCallOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [view, setView] = useState<CallItem | null>(null);
  const [busy, startTransition] = useTransition();
  const list = useMemo(() => calls.filter((c) => filter === "all" || (filter === "in" ? c.direction === "in" : filter === "out" ? c.direction === "out" : filter === "missed" ? c.status === "missed" : c.aiHandled)), [calls, filter]);

  const callBack = (c: CallItem) =>
    startTransition(async () => {
      const r = await callAction({ phone: c.phone, contactId: c.contactId });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`Звоним ${phoneFmt(c.phone)}`, { description: r.sandbox ? "Демо-режим: подключите телефонию в Интеграциях, чтобы звонок ушёл в АТС." : "Сначала зазвонит ваш телефон, затем — клиента." });
      router.refresh();
    });
  const setStatus = (c: CallItem, status: "completed" | "missed" | "busy") =>
    startTransition(async () => {
      const r = await setCallStatus(c.id, { status });
      if (!r.ok) { toast.error(r.error); return; }
      router.refresh();
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-canvas p-1">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={cn("h-7 rounded-full px-3 text-[13px] font-medium", filter === k ? "bg-ink text-canvas" : "text-ink-2 hover:text-ink")}>{label}</button>
          ))}
        </div>
        {canCreate && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setSimOpen(true)}><FlaskConical /> Имитировать входящий</Button>
            <Button onClick={() => setCallOpen(true)}><Phone /> Позвонить</Button>
          </div>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<Phone />} title="Звонков нет" description="Позвоните клиенту из карточки или нажмите «Позвонить» — звонок попадёт в журнал." />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className="w-10"></th>
              <th>Клиент</th>
              <th>Менеджер</th>
              <th>Статус</th>
              <th className="text-right">Длит.</th>
              <th>Дата</th>
              <th className="w-[1%]"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const Icon = c.status === "missed" ? PhoneMissed : c.direction === "in" ? PhoneIncoming : PhoneOutgoing;
              const st = STATUS[c.status];
              const live = c.status === "queued" || c.status === "ringing" || c.status === "answered";
              return (
                <tr key={c.id}>
                  <td><Icon className={cn("size-4", c.status === "missed" ? "text-accent" : c.direction === "in" ? "text-good" : "text-info")} /></td>
                  <td>
                    <div className="font-medium tnum">{c.contactName ?? phoneFmt(c.phone)}</div>
                    <div className="text-[12px] text-muted">
                      {c.contactName && <span className="tnum">{phoneFmt(c.phone)}</span>}
                      {c.companyId && <> · <Link href={`/companies/${c.companyId}`} className="hover:text-info hover:underline">{c.companyName}</Link></>}
                      {c.dealId && <> · <Link href={`/deals/${c.dealId}`} className="hover:text-info hover:underline">{c.dealTitle}</Link></>}
                    </div>
                  </td>
                  <td>
                    {c.aiHandled ? (
                      <span className="inline-flex items-center gap-1.5 text-violet"><span className="grid size-6 place-items-center rounded-full bg-violet-soft"><Bot className="size-3.5" /></span>{assistantName} (ИИ)</span>
                    ) : c.userName ? (
                      <span className="inline-flex items-center gap-1.5"><Avatar name={c.userName} color={c.userColor ?? undefined} size={24} />{c.userName}</span>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    {live && canEdit ? (
                      <Dropdown>
                        <DropdownTrigger asChild><button className="inline-flex items-center gap-1"><Badge tone={st.tone} dot>{st.label}</Badge><ChevronDown className="size-3.5 text-muted" /></button></DropdownTrigger>
                        <DropdownContent align="start">
                          <DropdownItem onSelect={() => setStatus(c, "completed")}>Состоялся</DropdownItem>
                          <DropdownItem onSelect={() => setStatus(c, "busy")}>Занято</DropdownItem>
                          <DropdownItem onSelect={() => setStatus(c, "missed")} danger>Пропущен</DropdownItem>
                        </DropdownContent>
                      </Dropdown>
                    ) : <Badge tone={st.tone} dot={live}>{st.label}</Badge>}
                  </td>
                  <td className="text-right tnum">{dur(c.durationSec)}</td>
                  <td className="whitespace-nowrap text-ink-2 tnum">{fmtDateTime(c.startedAt)}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {c.recordingUrl && <Button size="sm" variant="ghost" asChild><a href={c.recordingUrl} target="_blank" rel="noreferrer"><Play /> Запись</a></Button>}
                      {(c.transcript || c.aiSummary) && <Button size="sm" variant="ghost" onClick={() => setView(c)}><FileText /> {c.aiHandled ? "Транскрипт" : "Резюме"}</Button>}
                      {canCreate && <Button size="sm" variant="secondary" disabled={busy} onClick={() => callBack(c)}><Phone /> Перезвонить</Button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        {view && (
          <DialogContent title={view.aiHandled ? `Звонок принял ИИ · ${view.contactName ?? phoneFmt(view.phone)}` : `Звонок · ${view.contactName ?? phoneFmt(view.phone)}`} description={`${fmtDateTime(view.startedAt)} · ${dur(view.durationSec)}`} wide>
            {view.aiSummary && (
              <div className="mb-4 rounded-[10px] border border-violet/30 bg-violet-soft/50 p-3.5">
                <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-violet"><Bot className="size-4" /> Резюме</div>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{view.aiSummary}</p>
              </div>
            )}
            {view.transcript && (
              <div>
                <div className="mb-2 text-[12.5px] font-medium text-muted">Транскрипт</div>
                <div className="space-y-2">
                  {view.transcript.split("\n").filter(Boolean).map((line, i) => {
                    const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
                    const who = m?.[1] ?? "";
                    const isAi = /^ИИ|^WS_CRM|^Мария/i.test(who);
                    return (
                      <div key={i} className={cn("flex", isAi ? "justify-start" : "justify-end")}>
                        <div className={cn("max-w-[80%] rounded-[14px] px-3.5 py-2 text-[13.5px] leading-relaxed", isAi ? "rounded-bl-[5px] bg-violet-soft text-ink" : "rounded-br-[5px] border border-line bg-surface")}>
                          {m && <div className={cn("mb-0.5 text-[11px] font-medium", isAi ? "text-violet" : "text-muted")}>{who}</div>}
                          {m ? m[2] : line}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {view.dealId && <Button variant="secondary" asChild><Link href={`/deals/${view.dealId}`}>Открыть сделку</Link></Button>}
              {canCreate && <Button onClick={() => { callBack(view); setView(null); }}><Phone /> Перезвонить</Button>}
            </div>
          </DialogContent>
        )}
      </Dialog>

      <CallDialog open={callOpen} onOpenChange={setCallOpen} contacts={contacts} />
      <SimulateDialog open={simOpen} onOpenChange={setSimOpen} contacts={contacts} aiDefault={aiCallsEnabled} />
    </>
  );
}

function PeerPicker({ contacts, contactId, setContactId, phone, setPhone }: { contacts: ContactItem[]; contactId: string; setContactId: (v: string) => void; phone: string; setPhone: (v: string) => void }) {
  return (
    <>
      <Field label="Контакт">
        <Select value={contactId} onChange={(e) => { setContactId(e.target.value); const c = contacts.find((x) => x.id === e.target.value); if (c) setPhone(c.phone); }}>
          <option value="">Произвольный номер</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""} · {phoneFmt(c.phone)}</option>)}
        </Select>
      </Field>
      <Field label="Номер телефона"><Input value={phone} onChange={(e) => { setPhone(e.target.value); if (contactId) setContactId(""); }} placeholder="+998 90 123-45-67" inputMode="tel" /></Field>
    </>
  );
}

function CallDialog({ open, onOpenChange, contacts }: { open: boolean; onOpenChange: (o: boolean) => void; contacts: ContactItem[] }) {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      const r = await callAction({ phone, contactId: contactId || null });
      if (!r.ok) { toast.error(r.error); return; }
      onOpenChange(false);
      toast.success("Звонок запущен", { description: r.sandbox ? "Демо-режим: подключите OnlinePBX или Sipuni в Интеграциях." : "Сначала зазвонит ваш телефон, затем — клиента." });
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Позвонить" description="АТС сначала наберёт ваш номер, затем соединит с клиентом">
        <div className="space-y-4">
          <PeerPicker contacts={contacts} contactId={contactId} setContactId={setContactId} phone={phone} setPhone={setPhone} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={submit} disabled={busy || !phone.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Phone />} Позвонить</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SimulateDialog({ open, onOpenChange, contacts, aiDefault }: { open: boolean; onOpenChange: (o: boolean) => void; contacts: ContactItem[]; aiDefault: boolean }) {
  const router = useRouter();
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [phone, setPhone] = useState(contacts[0]?.phone ?? "");
  const [byAi, setByAi] = useState(aiDefault);
  const [busy, startTransition] = useTransition();
  const submit = () =>
    startTransition(async () => {
      const r = await simulateIncomingCall({ phone, contactId: contactId || null, byAi });
      if (!r.ok) { toast.error(r.error); return; }
      onOpenChange(false);
      if (r.status === "ai_handled") toast.success("ИИ принял звонок", { description: r.summary ?? undefined });
      else toast.warning("Звонок пропущен", { description: "Сработала автоматизация: задача менеджеру перезвонить и сообщение клиенту." });
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Имитировать входящий звонок" description="Демо: так выглядит входящий звонок с подключённой телефонией">
        <div className="space-y-4">
          <PeerPicker contacts={contacts} contactId={contactId} setContactId={setContactId} phone={phone} setPhone={setPhone} />
          <label className="flex items-center justify-between rounded-[10px] border border-line px-3.5 py-3">
            <span>
              <span className="flex items-center gap-1.5 text-[13.5px] font-medium"><Bot className="size-4 text-violet" /> ИИ принимает звонок</span>
              <span className="text-[12px] text-muted">{byAi ? "ИИ поговорит по сценарию, запишет транскрипт и создаст заявку" : "Никто не ответит: звонок станет пропущенным, менеджер получит задачу"}</span>
            </span>
            <Switch checked={byAi} onCheckedChange={setByAi} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={submit} disabled={busy || !phone.trim()}>{busy ? <Loader2 className="animate-spin" /> : <PhoneIncoming />} Позвонить в компанию</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
