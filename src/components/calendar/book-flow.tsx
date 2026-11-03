"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, MapPin, CalendarPlus, CheckCircle2, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Slot = { date: string; times: string[] };
type Props = {
  slug: string;
  type: { name: string; description: string | null; durationMin: number; location: string; userName: string; userColor: string };
  slots: Slot[];
  company: { name: string; phone: string };
};
type Done = { bookingId: string; startsAt: string; endsAt: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TZ = "Asia/Tashkent";
const fmtDay = (date: string) => cap(new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""));
const fmtDayLong = (iso: string) => cap(new Date(iso).toLocaleDateString("ru-RU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }));
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function BookFlow({ slug, type, slots: initialSlots, company }: Props) {
  const [slots, setSlots] = useState(initialSlots);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "", comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const step = done ? 4 : time ? 3 : day ? 2 : 1;
  const times = useMemo(() => slots.find((s) => s.date === day)?.times ?? [], [slots, day]);
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!time) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/public/booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, startsAt: time, ...form }) });
      const j = (await res.json()) as { ok: boolean; error?: string; slots?: Slot[]; booking?: Done };
      if (!j.ok) {
        setError(j.error ?? "Не удалось записаться");
        if (j.slots) { setSlots(j.slots); setTime(null); }
        return;
      }
      setDone(j.booking!);
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally { setBusy(false); }
  };

  const ics = done
    ? "data:text/calendar;charset=utf-8," + encodeURIComponent(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Oborot CRM//RU", "BEGIN:VEVENT", `UID:${done.bookingId}@oborot`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(done.startsAt)}`, `DTEND:${icsDate(done.endsAt)}`, `SUMMARY:${type.name} — ${company.name}`, `LOCATION:${type.location}`, `DESCRIPTION:Специалист: ${type.userName}. Телефон: ${company.phone}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n"))
    : "";

  return (
    <div className="rise">
      <Link href="/book" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Все услуги</Link>
      <div className="mt-3 rounded-[14px] border border-line bg-surface p-4 sm:p-5">
        <h1 className="text-[20px] font-semibold leading-snug tracking-[-0.01em]">{type.name}</h1>
        {type.description && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{type.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-muted" />{type.durationMin} мин · время Ташкента (UTC+5)</span>
          <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-muted" />{type.location}</span>
          <span className="inline-flex items-center gap-1.5"><Avatar name={type.userName} color={type.userColor} size={18} />{type.userName}</span>
        </div>
      </div>

      {!done && (
        <ol className="mt-5 flex items-center gap-1 text-[12px] text-muted">
          {["День", "Время", "Контакты"].map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium", step === i + 1 ? "bg-ink text-white" : step > i + 1 ? "bg-good-soft text-good" : "bg-black/5")}>{step > i + 1 ? <CheckCircle2 className="size-3.5" /> : <span className="tnum">{i + 1}</span>} {s}</span>
              {i < 2 && <ChevronRight className="size-3.5" />}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 rounded-[14px] border border-line bg-surface p-4 sm:p-5">
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto size-12 text-good" />
            <h2 className="mt-3 text-[20px] font-semibold">Вы записаны</h2>
            <p className="mt-1 text-[15px] text-ink-2">{fmtDayLong(done.startsAt)}, {fmtTime(done.startsAt)}–{fmtTime(done.endsAt)}</p>
            <div className="mt-4 rounded-[10px] bg-surface-2 p-3 text-left text-[14px]">
              <div className="font-medium">{type.name}</div>
              <div className="mt-0.5 text-ink-2">{type.userName} · {type.location}</div>
              <div className="mt-0.5 text-ink-2">{form.name}, {form.phone}</div>
            </div>
            <p className="mt-3 text-[13px] text-muted">Подтверждение отправили в мессенджер или на почту. Если планы изменятся — позвоните {company.phone}.</p>
            <a href={ics} download={`${slug}.ics`} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-ink text-[15px] font-medium text-white hover:bg-[#2a2e37]"><CalendarPlus className="size-4" /> Добавить в календарь</a>
            <Link href="/book" className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-[8px] text-[14px] text-ink-2 hover:bg-black/5">Записаться ещё</Link>
          </div>
        ) : step === 1 ? (
          <>
            <h2 className="text-[15px] font-semibold">Выберите день</h2>
            {slots.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button key={s.date} onClick={() => setDay(s.date)} className="flex h-16 flex-col items-center justify-center rounded-[10px] border border-line-strong bg-surface text-[14px] font-medium transition-colors hover:border-ink active:bg-surface-2">
                    {fmtDay(s.date)}
                    <span className="mt-0.5 text-[11px] font-normal text-muted">{s.times.length} окон</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-muted">Свободных окон в ближайшие дни нет. Позвоните нам: {company.phone}</p>
            )}
          </>
        ) : step === 2 ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{day && fmtDayLong(`${day}T12:00:00`)}</h2>
              <button onClick={() => setDay(null)} className="text-[13px] text-ink-2 hover:text-ink">Другой день</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {times.map((t) => (
                <button key={t} onClick={() => setTime(t)} className="h-11 rounded-[10px] border border-line-strong bg-surface text-[15px] font-medium tnum transition-colors hover:border-ink active:bg-surface-2">{fmtTime(t)}</button>
              ))}
              {!times.length && <p className="col-span-full text-[14px] text-muted">На этот день окон не осталось — выберите другой.</p>}
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex items-center justify-between rounded-[10px] bg-surface-2 px-3 py-2.5 text-[14px]">
              <span><span className="font-medium">{time && fmtDayLong(time)}</span>, {time && fmtTime(time)}</span>
              <button type="button" onClick={() => setTime(null)} className="text-[13px] text-ink-2 hover:text-ink">Изменить</button>
            </div>
            <Field label="Ваше имя"><Input className="h-11 text-[15px]" value={form.name} onChange={(e) => set("name", e.target.value)} required autoComplete="name" placeholder="Иван Петров" /></Field>
            <Field label="Телефон"><Input className="h-11 text-[15px]" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required autoComplete="tel" placeholder="+998 90 123-45-67" /></Field>
            <Field label="Email" hint="Пришлём подтверждение и напоминание"><Input className="h-11 text-[15px]" type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" placeholder="ivan@company.ru" /></Field>
            <Field label="Компания (необязательно)"><Input className="h-11 text-[15px]" value={form.company} onChange={(e) => set("company", e.target.value)} autoComplete="organization" placeholder="ООО «Ромашка»" /></Field>
            <Field label="Комментарий"><Textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={3} placeholder="Что хотите обсудить, адрес объекта" /></Field>
            {error && <div className="rounded-[8px] bg-accent-soft px-3 py-2 text-[13px] text-accent">{error}</div>}
            <button type="submit" disabled={busy} className="inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-ink text-[15px] font-medium text-white hover:bg-[#2a2e37] disabled:opacity-60">{busy ? "Записываем…" : "Записаться"}</button>
            <p className="text-center text-[12px] text-muted">Нажимая «Записаться», вы соглашаетесь на обработку персональных данных.</p>
          </form>
        )}
      </div>
    </div>
  );
}
