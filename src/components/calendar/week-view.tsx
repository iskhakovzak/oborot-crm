"use client";
import { TZ_OFFSET_MIN } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Building2, KanbanSquare, Phone, Mail, Globe, UserRound, XCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cancelBooking, completeBooking, createBooking } from "@/app/(app)/calendar/actions";
import { fmtTime, fmtDateLong, phoneFmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CalUser = { id: string; name: string; color: string };
export type CalBooking = {
  id: string; title: string; startsAt: string; endsAt: string; userId: string; userName: string; userColor: string;
  clientName: string | null; clientPhone: string | null; clientEmail: string | null; comment: string | null;
  companyId: string | null; companyName: string | null; dealId: string | null; dealTitle: string | null; source: "public" | "manual"; status: "confirmed" | "cancelled" | "done"; typeName: string | null;
};

const HOUR_START = 8, HOUR_END = 20, HOUR_H = 64;
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function WeekView({ weekStart, bookings, users, companies, filterUser, canCreate, canEdit, defaultUserId }: {
  weekStart: string; bookings: CalBooking[]; users: CalUser[]; companies: { id: string; name: string }[]; filterUser: string; canCreate: boolean; canEdit: boolean; defaultUserId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalBooking | null>(null);
  const [creating, setCreating] = useState<{ date: string; time: string } | null>(null);
  const start = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), [start]);
  const todayKey = iso(new Date());
  const shift = (n: number) => { const d = new Date(start); d.setDate(d.getDate() + n * 7); return iso(d); };
  const nav = (week: string, user = filterUser) => router.push(`/calendar?week=${week}${user ? `&user=${user}` : ""}`);
  const monthLabel = `${days[0].toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} — ${days[6].toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`;
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const nowTop = (() => { const n = new Date(Date.now() + TZ_OFFSET_MIN * 60_000); const m = n.getUTCHours() * 60 + n.getUTCMinutes() - HOUR_START * 60; return m >= 0 && m <= (HOUR_END - HOUR_START) * 60 ? (m / 60) * HOUR_H : null; })();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-[8px] border border-line-strong bg-surface">
          <button className="grid h-8 w-8 place-items-center rounded-l-[8px] text-ink-2 hover:bg-surface-2" onClick={() => nav(shift(-1))} aria-label="Предыдущая неделя"><ChevronLeft className="size-4" /></button>
          <button className="h-8 border-x border-line-strong px-3 text-[13px] font-medium hover:bg-surface-2" onClick={() => nav(iso(new Date()))}>Сегодня</button>
          <button className="grid h-8 w-8 place-items-center rounded-r-[8px] text-ink-2 hover:bg-surface-2" onClick={() => nav(shift(1))} aria-label="Следующая неделя"><ChevronRight className="size-4" /></button>
        </div>
        <div className="text-[15px] font-semibold">{monthLabel}</div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={filterUser} onChange={(e) => nav(weekStart, e.target.value)} className="h-8 w-auto min-w-[180px] text-[13px]">
            <option value="">Все сотрудники</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {canCreate && <Button size="sm" onClick={() => setCreating({ date: todayKey >= weekStart && todayKey <= iso(days[6]) ? todayKey : weekStart, time: "10:00" })}><Plus /> Новое событие</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line">
            <div />
            {days.map((d, i) => {
              const key = iso(d), isToday = key === todayKey;
              const n = bookings.filter((b) => iso(new Date(b.startsAt)) === key).length;
              return (
                <div key={key} className={cn("border-l border-line px-2 py-2 text-center", isToday && "bg-info-soft/40")}>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{WEEKDAYS[i]}</div>
                  <div className={cn("mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-[15px] font-semibold tnum", isToday && "bg-ink text-canvas")}>{d.getDate()}</div>
                  <div className="text-[11px] text-muted">{n ? `${n} соб.` : " "}</div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR_H }}>
            <div className="relative">
              {hours.map((h) => (
                <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tnum text-muted" style={{ top: (h - HOUR_START) * HOUR_H }}>{h === HOUR_START ? "" : `${String(h).padStart(2, "0")}:00`}</div>
              ))}
            </div>
            {days.map((d) => {
              const key = iso(d), isToday = key === todayKey;
              const items = bookings.filter((b) => iso(new Date(b.startsAt)) === key);
              return (
                <div key={key} className={cn("relative border-l border-line", isToday && "bg-info-soft/20")}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className={cn("absolute inset-x-0 border-t border-line", canCreate && "cursor-pointer hover:bg-surface-2")}
                      style={{ top: (h - HOUR_START) * HOUR_H, height: HOUR_H }}
                      onClick={() => canCreate && setCreating({ date: key, time: `${String(h).padStart(2, "0")}:00` })}
                    />
                  ))}
                  {isToday && nowTop != null && <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-accent" style={{ top: nowTop }} />}
                  {items.map((b) => {
                    const s = new Date(b.startsAt), e = new Date(b.endsAt);
                    const sl = new Date(s.getTime() + TZ_OFFSET_MIN * 60_000); const top = ((sl.getUTCHours() * 60 + sl.getUTCMinutes() - HOUR_START * 60) / 60) * HOUR_H;
                    const h = Math.max(22, ((e.getTime() - s.getTime()) / 3_600_000) * HOUR_H - 2);
                    if (top + h < 0 || top > hours.length * HOUR_H) return null;
                    return (
                      <button
                        key={b.id}
                        onClick={(ev) => { ev.stopPropagation(); setSelected(b); }}
                        className={cn("absolute inset-x-1 z-[5] overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight transition-shadow hover:shadow-pop", b.status === "cancelled" && "opacity-50 line-through", b.status === "done" && "opacity-70")}
                        style={{ top: Math.max(0, top), height: h, background: `${b.userColor}1f`, borderColor: b.userColor }}
                        title={`${b.title} · ${fmtTime(b.startsAt)}–${fmtTime(b.endsAt)}`}
                      >
                        {h < 40 ? (
                          <div className="truncate"><span className="tnum text-ink-2">{fmtTime(b.startsAt)}</span> <span className="font-medium text-ink">{b.title}</span></div>
                        ) : (
                          <>
                            <div className="tnum text-ink-2">{fmtTime(b.startsAt)}–{fmtTime(b.endsAt)}</div>
                            <div className="truncate font-medium text-ink">{b.title}</div>
                            {h > 56 && b.clientName && <div className="truncate text-ink-2">{b.clientName}</div>}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {users.map((u) => <span key={u.id} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: u.color }} />{u.name}</span>)}
      </div>

      {selected && <BookingDialog b={selected} canEdit={canEdit} onClose={() => setSelected(null)} />}
      {creating && <NewBookingDialog initial={creating} users={users} companies={companies} defaultUserId={filterUser || defaultUserId} onClose={() => setCreating(null)} />}
    </div>
  );
}

function BookingDialog({ b, canEdit, onClose }: { b: CalBooking; canEdit: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => { const r = await fn(); if (!r.ok) { toast.error(r.error ?? "Ошибка"); return; } toast.success(okMsg); onClose(); router.refresh(); });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={b.title} description={`${fmtDateLong(b.startsAt)}, ${fmtTime(b.startsAt)}–${fmtTime(b.endsAt)}`}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={b.status === "confirmed" ? "good" : b.status === "done" ? "neutral" : "accent"} dot>{b.status === "confirmed" ? "Подтверждено" : b.status === "done" ? "Проведено" : "Отменено"}</Badge>
            <Badge tone={b.source === "public" ? "info" : "neutral"}>{b.source === "public" ? <><Globe className="size-3" /> Онлайн-запись</> : "Вручную"}</Badge>
            {b.typeName && <Badge tone="violet">{b.typeName}</Badge>}
          </div>
          <div className="flex items-center gap-2"><Avatar name={b.userName} color={b.userColor} size={24} /><span>{b.userName}</span></div>
          {(b.clientName || b.clientPhone || b.clientEmail) && (
            <div className="rounded-[8px] border border-line bg-surface-2/60 p-3">
              {b.clientName && <div className="flex items-center gap-2 font-medium"><UserRound className="size-4 text-muted" />{b.clientName}</div>}
              {b.clientPhone && <div className="mt-1 flex items-center gap-2 text-ink-2"><Phone className="size-4 text-muted" /><a href={`tel:${b.clientPhone}`} className="hover:underline">{phoneFmt(b.clientPhone)}</a></div>}
              {b.clientEmail && <div className="mt-1 flex items-center gap-2 text-ink-2"><Mail className="size-4 text-muted" /><a href={`mailto:${b.clientEmail}`} className="hover:underline">{b.clientEmail}</a></div>}
            </div>
          )}
          {b.comment && <p className="whitespace-pre-wrap text-ink-2">{b.comment}</p>}
          <div className="flex flex-wrap gap-2">
            {b.companyId && <Button asChild variant="secondary" size="sm"><Link href={`/companies/${b.companyId}`}><Building2 /> {b.companyName ?? "Клиент"}</Link></Button>}
            {b.dealId && <Button asChild variant="secondary" size="sm"><Link href={`/deals/${b.dealId}`}><KanbanSquare /> {b.dealTitle ?? "Сделка"}</Link></Button>}
          </div>
        </div>
        {canEdit && b.status === "confirmed" && (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => act(() => cancelBooking(b.id), "Событие отменено")}><XCircle /> Отменить</Button>
            <Button variant="good" disabled={pending} onClick={() => act(() => completeBooking(b.id), "Отмечено как проведённое")}><CheckCircle2 /> Проведено</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewBookingDialog({ initial, users, companies, defaultUserId, onClose }: { initial: { date: string; time: string }; users: CalUser[]; companies: { id: string; name: string }[]; defaultUserId: string; onClose: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [f, setF] = useState({ title: "", userId: defaultUserId || users[0]?.id || "", date: initial.date, time: initial.time, durationMin: 30, companyId: "", comment: "" });
  const set = (k: keyof typeof f, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const submit = () =>
    start(async () => {
      const r = await createBooking({ ...f, companyId: f.companyId || null });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Событие добавлено в календарь");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Новое событие" description="Запись клиента, встреча или замер в календаре сотрудника">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Название"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Консультация: Технострой" autoFocus required /></Field>
          <Field label="Сотрудник">
            <Select value={f.userId} onChange={(e) => set("userId", e.target.value)}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} required /></Field>
            <Field label="Время"><Input type="time" value={f.time} onChange={(e) => set("time", e.target.value)} required step={300} /></Field>
            <Field label="Длительность"><Select value={f.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))}>{DURATIONS.map((d) => <option key={d} value={d}>{d} мин</option>)}</Select></Field>
          </div>
          <Field label="Клиент" hint="Контакт, телефон и открытая сделка подтянутся из карточки">
            <Select value={f.companyId} onChange={(e) => set("companyId", e.target.value)}>
              <option value="">Без клиента</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Комментарий"><Textarea value={f.comment} onChange={(e) => set("comment", e.target.value)} rows={3} placeholder="Адрес, что обсудить, что взять с собой" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Отмена</Button>
            <Button type="submit" disabled={pending}>Добавить в календарь</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
