"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Send, Plus, FlaskConical, Building2, KanbanSquare, Check, RotateCcw, Paperclip, Bot, Zap, Loader2, X, CornerDownLeft, UserRound } from "lucide-react";
import type { Channel } from "@/db/schema";
import { cn } from "@/lib/utils";
import { fmtTime, fmtDateLong } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, Textarea, Field } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tip } from "@/components/ui/tooltip";
import { CHANNELS, CHANNEL_LIST, ChannelIcon } from "./channel";
import { sendReply, suggestReply, setAi, assign, setStatus, createDealFromConversation, simulateIncoming, startConversation } from "@/app/(app)/inbox/actions";

export type ConvItem = {
  id: string; channel: Channel; peerName: string; peerAddress: string; status: "open" | "closed"; aiEnabled: boolean; unread: number; lastMessageAt: string; lastRel: string;
  companyId: string | null; companyName: string | null; dealId: string | null; assigneeId: string | null; assigneeName: string | null;
  lastText: string; lastDirection: "in" | "out" | null; lastIsAi: boolean;
};
export type MsgItem = { id: string; direction: "in" | "out"; text: string; attachments: { name: string; url: string }[]; isAi: boolean; isAutomation: boolean; status: string; createdAt: string; authorName: string | null };
type UserItem = { id: string; name: string; color: string };
type ContactItem = { id: string; name: string; company: string | null; channels: Channel[] };

const PRESETS = ["Здравствуйте! Сколько стоит кондиционер на 30 м² с монтажом?", "Когда сможете доставить и смонтировать?", "Позовите менеджера, хочу обсудить скидку", "Спасибо, всё получили, вопросов нет"];

function href(p: { c?: string | null; channel?: Channel | null; f?: string }) {
  const q = new URLSearchParams();
  if (p.c) q.set("c", p.c);
  if (p.channel) q.set("channel", p.channel);
  if (p.f && p.f !== "all") q.set("f", p.f);
  const s = q.toString();
  return s ? `/inbox?${s}` : "/inbox";
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400_000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  return fmtDateLong(iso);
}

export function InboxView(props: {
  conversations: ConvItem[]; counts: { all: number; mine: number; unanswered: number }; byChannel: Record<Channel, number>; channel: Channel | null; filter: string;
  selected: ConvItem | null; messages: MsgItem[]; dealTitle: string | null; users: UserItem[]; contacts: ContactItem[]; currentUserId: string; canEdit: boolean; canCreateDeal: boolean;
}) {
  const { conversations, counts, byChannel, channel, filter, selected, users, contacts, canEdit } = props;
  const [newOpen, setNewOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const filters = [["all", "Все", counts.all], ["mine", "Мои", counts.mine], ["unanswered", "Без ответа", counts.unanswered]] as const;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-[12px] border border-line bg-surface lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("flex min-h-0 flex-col border-r border-line", selected && "hidden lg:flex")}>
        <div className="space-y-2.5 border-b border-line px-3 pt-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            <div className="inline-flex h-8 flex-1 items-center gap-0.5 rounded-full border border-line bg-canvas p-0.5">
              {filters.map(([key, label, n]) => (
                <Link key={key} href={href({ c: selected?.id, channel, f: key })} className={cn("flex h-7 flex-1 items-center justify-center gap-1 rounded-full text-[12.5px] font-medium", filter === key ? "bg-ink text-canvas" : "text-ink-2 hover:text-ink")}>
                  {label}
                  <span className={cn("tnum text-[11px]", filter === key ? "text-muted" : "text-muted/80")}>{n}</span>
                </Link>
              ))}
            </div>
            {canEdit && (
              <>
                <Tip label="Новая переписка"><Button size="iconSm" onClick={() => setNewOpen(true)} aria-label="Новая переписка"><Plus /></Button></Tip>
                <Tip label="Имитировать входящее (демо)"><Button size="iconSm" variant="secondary" onClick={() => setSimOpen(true)} aria-label="Имитировать входящее"><FlaskConical /></Button></Tip>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Link href={href({ c: selected?.id, f: filter })} className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11.5px]", !channel ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-line-strong")}>Все каналы</Link>
            {CHANNEL_LIST.filter((ch) => ch !== "web" || byChannel.web > 0).map((ch) => (
              <Link key={ch} href={href({ c: selected?.id, channel: ch, f: filter })} className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-1.5 pr-2 text-[11.5px]", channel === ch ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-line-strong")}>
                <ChannelIcon channel={ch} size={14} />
                {CHANNELS[ch].label}
                <span className="tnum opacity-60">{byChannel[ch]}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-muted">Нет переписок по выбранному фильтру</div>}
          {conversations.map((c) => (
            <Link key={c.id} href={href({ c: c.id, channel, f: filter })} className={cn("flex gap-3 border-b border-line px-3 py-2.5 transition-colors hover:bg-surface-2", selected?.id === c.id && "bg-surface-2")}>
              <div className="relative shrink-0">
                <Avatar name={c.peerName} size={38} color={c.status === "closed" ? "#3a3a3a" : undefined} />
                <ChannelIcon channel={c.channel} size={16} className="absolute -right-1 -bottom-0.5 ring-2 ring-surface" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("truncate text-[13.5px]", c.unread ? "font-semibold" : "font-medium")}>{c.peerName}</span>
                  {c.aiEnabled && <Badge tone="violet" className="h-4 px-1.5 text-[10px] leading-4">ИИ</Badge>}
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{c.lastRel}</span>
                </div>
                <div className="truncate text-[12px] text-muted">{c.companyName ?? CHANNELS[c.channel].label}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={cn("truncate text-[12.5px]", c.unread ? "text-ink" : "text-ink-2")}>
                    {c.lastDirection === "out" && <span className="text-muted">{c.lastIsAi ? "ИИ: " : "Вы: "}</span>}
                    {c.lastText || "—"}
                  </span>
                  {c.unread > 0 && <span className="ml-auto grid min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1 text-[10.5px] font-semibold leading-[18px] text-white tnum">{c.unread}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </aside>
      <section className="flex min-h-0 flex-col">
        {selected ? (
          <Chat key={selected.id} conv={selected} messages={props.messages} dealTitle={props.dealTitle} users={users} currentUserId={props.currentUserId} canEdit={canEdit} canCreateDeal={props.canCreateDeal} backHref={href({ channel, f: filter })} onSimulate={() => setSimOpen(true)} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-muted"><Send className="size-5" /></div>
            <h3 className="mt-3 text-[15px] font-semibold">Выберите переписку</h3>
            <p className="mt-1 max-w-[40ch] text-[13px] text-muted">Слева — все диалоги из мессенджеров, почты и SMS. Непрочитанные отмечены красным, ответы ИИ — фиолетовым.</p>
            {canEdit && (
              <div className="mt-4 flex gap-2">
                <Button onClick={() => setNewOpen(true)}><Plus /> Новая переписка</Button>
                <Button variant="secondary" onClick={() => setSimOpen(true)}><FlaskConical /> Имитировать входящее</Button>
              </div>
            )}
          </div>
        )}
      </section>
      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} contacts={contacts} />
      <SimulateDialog open={simOpen} onOpenChange={setSimOpen} contacts={contacts} selected={selected} />
    </div>
  );
}

function Chat({ conv, messages, dealTitle, users, currentUserId, canEdit, canCreateDeal, backHref, onSimulate }: { conv: ConvItem; messages: MsgItem[]; dealTitle: string | null; users: UserItem[]; currentUserId: string; canEdit: boolean; canCreateDeal: boolean; backHref: string; onSimulate: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ id: string; text: string; at: string }[]>([]);
  const [suggestion, setSuggestion] = useState<{ text: string; handoff: boolean; sandbox: boolean } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [busy, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPending((p) => p.filter((x) => !messages.some((m) => m.direction === "out" && m.text === x.text)));
  }, [messages]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending.length, suggestion]);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(160, Math.max(40, ta.scrollHeight)) + "px";
  }, [text]);

  const groups = useMemo(() => {
    const all = [...messages.map((m) => ({ ...m, pending: false })), ...pending.map((p) => ({ id: p.id, direction: "out" as const, text: p.text, attachments: [], isAi: false, isAutomation: false, status: "queued", createdAt: p.at, authorName: null, pending: true }))];
    const out: { day: string; items: typeof all }[] = [];
    for (const m of all) {
      const day = dayLabel(m.createdAt);
      const g = out[out.length - 1];
      if (g && g.day === day) g.items.push(m); else out.push({ day, items: [m] });
    }
    return out;
  }, [messages, pending]);

  const send = (value: string) => {
    const t = value.trim();
    if (!t || !canEdit) return;
    setText("");
    setSuggestion(null);
    setPending((p) => [...p, { id: `tmp_${Date.now()}`, text: t, at: new Date().toISOString() }]);
    startTransition(async () => {
      const r = await sendReply({ conversationId: conv.id, text: t });
      if (!r.ok) { toast.error(r.error); setPending((p) => p.filter((x) => x.text !== t)); setText(t); return; }
      if (r.sandbox) toast.message("Отправлено в демо-режиме", { description: `Подключите ${CHANNELS[conv.channel].label} в Интеграциях, чтобы сообщения уходили клиенту.` });
      router.refresh();
    });
  };
  const suggest = async () => {
    setSuggesting(true);
    const r = await suggestReply(conv.id);
    setSuggesting(false);
    if (!r.ok) return toast.error(r.error);
    setSuggestion({ text: r.text, handoff: r.handoff, sandbox: r.sandbox });
  };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) { toast.error(r.error ?? "Ошибка"); return; }
      if (okText) toast.success(okText);
      router.refresh();
    });

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <Link href={backHref} className="lg:hidden text-[13px] text-info">← Все</Link>
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <Avatar name={conv.peerName} size={36} />
            <ChannelIcon channel={conv.channel} size={15} className="absolute -right-1 -bottom-0.5 ring-2 ring-surface" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-semibold">{conv.peerName}</span>
              {conv.status === "closed" && <Badge tone="neutral">Закрыта</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
              <span>{CHANNELS[conv.channel].label} · {conv.peerAddress}</span>
              {conv.companyId && <Link href={`/companies/${conv.companyId}`} className="inline-flex items-center gap-1 text-info hover:underline"><Building2 className="size-3.5" />{conv.companyName}</Link>}
              {conv.dealId ? (
                <Link href={`/deals/${conv.dealId}`} className="inline-flex items-center gap-1 text-info hover:underline"><KanbanSquare className="size-3.5" />{dealTitle ?? "Сделка"}</Link>
              ) : canCreateDeal ? (
                <button onClick={() => act(() => createDealFromConversation(conv.id), "Сделка создана")} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline"><Plus className="size-3.5" />Создать сделку</button>
              ) : null}
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="flex h-8 items-center gap-2 rounded-[8px] border border-line px-2.5 text-[12.5px]">
              <Bot className="size-4 text-violet" />
              ИИ отвечает
              <Switch checked={conv.aiEnabled} disabled={busy} onCheckedChange={(v) => act(() => setAi(conv.id, v), v ? "ИИ будет отвечать в этой переписке" : "ИИ выключен")} />
            </label>
            <Select value={conv.assigneeId ?? ""} disabled={busy} onChange={(e) => act(() => assign(conv.id, e.target.value || null))} className="h-8 w-auto max-w-[180px] text-[12.5px]" aria-label="Ответственный">
              <option value="">Не назначено</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.id === currentUserId ? "Я — " : ""}{u.name}</option>)}
            </Select>
            {conv.status === "open" ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => setStatus(conv.id, "closed"), "Переписка закрыта")}><Check /> Закрыть</Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => setStatus(conv.id, "open"), "Переписка открыта")}><RotateCcw /> Открыть</Button>
            )}
            <Tip label="Имитировать входящее от клиента (демо)"><Button size="iconSm" variant="ghost" onClick={onSimulate} aria-label="Имитировать входящее"><FlaskConical /></Button></Tip>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2/70 px-4 py-4 lg:px-6">
        {groups.length === 0 && <div className="py-10 text-center text-[13px] text-muted">Сообщений пока нет — напишите первым.</div>}
        {groups.map((g) => (
          <div key={g.day}>
            <div className="my-3 flex items-center gap-3 text-[11.5px] text-muted" suppressHydrationWarning><span className="h-px flex-1 bg-line" />{g.day}<span className="h-px flex-1 bg-line" /></div>
            {g.items.map((m, i) => {
              const out = m.direction === "out";
              const prev = g.items[i - 1];
              const tight = prev && prev.direction === m.direction && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start", tight ? "mt-1" : "mt-3")}>
                  <div className={cn("max-w-[72%]", out ? "items-end" : "items-start", "flex flex-col")}>
                    {(m.isAi || m.isAutomation) && !tight && (
                      <div className="mb-1 flex gap-1">
                        {m.isAi && <Badge tone="violet" className="h-5 text-[10.5px]"><Bot className="size-3" /> ИИ</Badge>}
                        {m.isAutomation && <Badge tone="info" className="h-5 text-[10.5px]"><Zap className="size-3" /> Автоматизация</Badge>}
                      </div>
                    )}
                    <div className={cn("whitespace-pre-wrap break-words rounded-[16px] px-3.5 py-2 text-[13.5px] leading-relaxed", out ? "rounded-br-[5px] bg-ink text-canvas" : "rounded-bl-[5px] border border-line bg-surface-2 text-ink", m.pending && "opacity-60", m.status === "failed" && "ring-2 ring-accent/40")}>
                      {m.text}
                      {m.attachments.length > 0 && (
                        <div className={cn("mt-1.5 flex flex-col gap-1 border-t pt-1.5 text-[12.5px]", out ? "border-canvas/15" : "border-line")}>
                          {m.attachments.map((a, k) => (
                            <a key={k} href={a.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1.5 underline-offset-2 hover:underline", out ? "text-canvas/90" : "text-info")}><Paperclip className="size-3.5" />{a.name}</a>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-0.5 px-1 text-[11px] text-muted" suppressHydrationWarning>
                      {out && m.authorName && !m.isAi && <span>{m.authorName} · </span>}
                      {m.pending ? "отправляется…" : fmtTime(m.createdAt)}
                      {m.status === "failed" && <span className="text-accent"> · не доставлено</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {canEdit && (
        <div className="border-t border-line bg-surface px-4 py-3">
          {suggestion && (
            <div className="mb-3 rounded-[10px] border border-violet/30 bg-violet-soft/50 p-3">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-violet">
                <Sparkles className="size-4" /> Предложение ИИ
                {suggestion.handoff && <Badge tone="warn" className="ml-1">Рекомендует передать менеджеру</Badge>}
                {suggestion.sandbox && <span className="font-normal text-muted">· демо-режим</span>}
                <button className="ml-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setSuggestion(null)} aria-label="Закрыть"><X className="size-4" /></button>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{suggestion.text}</p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => send(suggestion.text)}><Send /> Отправить</Button>
                <Button size="sm" variant="secondary" onClick={() => { setText(suggestion.text); setSuggestion(null); taRef.current?.focus(); }}>Вставить в поле</Button>
                <Button size="sm" variant="ghost" disabled={suggesting} onClick={suggest}>{suggesting ? <Loader2 className="animate-spin" /> : <RotateCcw />} Другой вариант</Button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }}
              placeholder={conv.status === "closed" ? "Переписка закрыта — отправка откроет её снова" : `Написать в ${CHANNELS[conv.channel].label}…`}
              rows={1}
              className="min-h-[40px] resize-none"
            />
            <Tip label="Предложить ответ ИИ">
              <Button variant="secondary" size="icon" onClick={suggest} disabled={suggesting} aria-label="Предложить ответ ИИ">{suggesting ? <Loader2 className="animate-spin" /> : <Sparkles className="text-violet" />}</Button>
            </Tip>
            <Button size="icon" onClick={() => send(text)} disabled={!text.trim() || busy} aria-label="Отправить"><Send /></Button>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted"><CornerDownLeft className="size-3" /> Enter — отправить, Shift+Enter — перенос строки</div>
        </div>
      )}
    </>
  );
}

function NewConversationDialog({ open, onOpenChange, contacts }: { open: boolean; onOpenChange: (o: boolean) => void; contacts: ContactItem[] }) {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<Channel>("telegram");
  const [text, setText] = useState("");
  const [busy, startTransition] = useTransition();
  const contact = contacts.find((c) => c.id === contactId);
  const channels = contact?.channels ?? [];
  useEffect(() => { if (contact && !contact.channels.includes(channel) && contact.channels[0]) setChannel(contact.channels[0]); }, [contact, channel]);
  const submit = () => {
    if (!contactId) return toast.error("Выберите контакт");
    startTransition(async () => {
      const r = await startConversation({ contactId, channel, text });
      if (!r.ok) { toast.error(r.error); return; }
      onOpenChange(false);
      setText("");
      router.push(href({ c: r.conversationId }));
      router.refresh();
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Новая переписка" description="Напишите клиенту первым в удобный ему канал">
        <div className="space-y-4">
          <Field label="Контакт">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Выберите контакт…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Канал" hint={contact && !channels.length ? "У контакта нет ни одного адреса для связи" : undefined}>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_LIST.filter((ch) => ch !== "web").map((ch) => {
                const ok = !contact || channels.includes(ch);
                return (
                  <button key={ch} type="button" disabled={!ok} onClick={() => setChannel(ch)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-[13px]", channel === ch ? "border-ink bg-ink text-canvas" : "border-line-strong text-ink-2 hover:bg-surface-2", !ok && "opacity-40")}>
                    <ChannelIcon channel={ch} size={16} />{CHANNELS[ch].label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Сообщение"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Здравствуйте! Это WS_CRM…" /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={submit} disabled={busy || !contactId || (!!contact && !channels.length)}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Отправить</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SimulateDialog({ open, onOpenChange, contacts, selected }: { open: boolean; onOpenChange: (o: boolean) => void; contacts: ContactItem[]; selected: ConvItem | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"current" | "contact">(selected ? "current" : "contact");
  const [contactId, setContactId] = useState("");
  const [channel, setChannel] = useState<Channel>("telegram");
  const [text, setText] = useState(PRESETS[0]);
  const [busy, startTransition] = useTransition();
  useEffect(() => { setMode(selected ? "current" : "contact"); }, [selected, open]);
  const contact = contacts.find((c) => c.id === contactId);
  useEffect(() => { if (contact && !contact.channels.includes(channel) && contact.channels[0]) setChannel(contact.channels[0]); }, [contact, channel]);
  const submit = () => {
    startTransition(async () => {
      const r = await simulateIncoming(mode === "current" && selected ? { conversationId: selected.id, text } : { contactId, channel, text });
      if (!r.ok) { toast.error(r.error); return; }
      onOpenChange(false);
      toast.success("Входящее получено", { description: "Сработали автоматизации на событие «Входящее сообщение»." });
      router.push(href({ c: r.conversationId }));
      router.refresh();
    });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Имитировать входящее" description="Демо: сообщение от клиента попадёт в переписку и запустит автоматизации, включая ответ ИИ">
        <div className="space-y-4">
          {selected && (
            <div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-line bg-canvas p-1">
              <button type="button" onClick={() => setMode("current")} className={cn("h-7 rounded-full px-3 text-[13px] font-medium", mode === "current" ? "bg-ink text-canvas" : "text-ink-2")}>В текущую переписку</button>
              <button type="button" onClick={() => setMode("contact")} className={cn("h-7 rounded-full px-3 text-[13px] font-medium", mode === "contact" ? "bg-ink text-canvas" : "text-ink-2")}>От другого контакта</button>
            </div>
          )}
          {mode === "current" && selected ? (
            <div className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5 text-[13px]">
              <Avatar name={selected.peerName} size={30} />
              <div><div className="font-medium">{selected.peerName}</div><div className="text-muted">{CHANNELS[selected.channel].label} · {selected.peerAddress}</div></div>
            </div>
          ) : (
            <>
              <Field label="Контакт">
                <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">Выберите контакт…</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>)}
                </Select>
              </Field>
              <Field label="Канал">
                <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                  {CHANNEL_LIST.filter((ch) => ch !== "web" && (!contact || contact.channels.includes(ch))).map((ch) => <option key={ch} value={ch}>{CHANNELS[ch].label}</option>)}
                </Select>
              </Field>
            </>
          )}
          <Field label="Текст от клиента">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => <button key={p} type="button" onClick={() => setText(p)} className={cn("rounded-full border px-2.5 py-1 text-[12px] hover:bg-surface-2", text === p ? "border-ink" : "border-line text-ink-2")}>{p.length > 42 ? p.slice(0, 40) + "…" : p}</button>)}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={submit} disabled={busy || !text.trim() || (mode === "contact" && !contactId)}>{busy ? <Loader2 className="animate-spin" /> : <UserRound />} Получить сообщение</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
