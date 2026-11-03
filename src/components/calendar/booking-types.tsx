"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Pencil, Plus, Clock, MapPin, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/page";
import { saveBookingType, toggleBookingType, type BookingTypeInput } from "@/app/(app)/calendar/actions";
import type { CalUser } from "./week-view";
import { cn } from "@/lib/utils";

export type BookingTypeRow = BookingTypeInput & { id: string; userName: string; userColor: string; bookings30: number };
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAY_IDX = [1, 2, 3, 4, 5, 6, 0];
export const daysLabel = (days: number[]) => DAY_IDX.filter((d) => days.includes(d)).map((d) => DAYS[DAY_IDX.indexOf(d)]).join(", ") || "—";

export function BookingTypes({ types, users, appUrl, canEdit, canCreate, currentUserId, lockUser }: { types: BookingTypeRow[]; users: CalUser[]; appUrl: string; canEdit: boolean; canCreate: boolean; currentUserId: string; lockUser: boolean }) {
  const [editing, setEditing] = useState<Partial<BookingTypeRow> | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const copy = (url: string) => navigator.clipboard.writeText(url).then(() => toast.success("Ссылка скопирована", { description: url }));
  const toggle = (t: BookingTypeRow, v: boolean) => start(async () => { const r = await toggleBookingType(t.id, v); if (!r.ok) { toast.error(r.error); return; } toast.success(v ? "Онлайн-запись включена" : "Онлайн-запись выключена"); router.refresh(); });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted max-w-[70ch]">Клиент сам выбирает свободный слот на публичной странице — запись попадает в календарь сотрудника, а в CRM создаются клиент и сделка.</p>
        {canCreate && <Button size="sm" onClick={() => setEditing({})}><Plus /> Новый тип записи</Button>}
      </div>
      {types.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {types.map((t) => {
            const url = `${appUrl}/book/${t.slug}`;
            return (
              <div key={t.id} className={cn("rounded-[12px] border border-line bg-surface p-4", !t.isActive && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold">{t.name}</h3>
                      <Badge tone={t.isActive ? "good" : "neutral"} dot>{t.isActive ? "Включена" : "Выключена"}</Badge>
                    </div>
                    {t.description && <p className="mt-1 text-[13px] text-muted">{t.description}</p>}
                  </div>
                  {canEdit && <Switch checked={t.isActive} disabled={pending} onCheckedChange={(v) => toggle(t, v)} aria-label="Включить онлайн-запись" />}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
                  <div className="flex items-center gap-2"><Avatar name={t.userName} color={t.userColor} size={20} />{t.userName}</div>
                  <div className="flex items-center gap-2"><Clock className="size-4 text-muted" />{t.durationMin} мин <span className="text-muted">+ буфер {t.bufferMin} мин</span></div>
                  <div className="col-span-2 flex items-center gap-2"><CalendarDays className="size-4 text-muted" />{daysLabel(t.workDays)}, {t.workStart}–{t.workEnd} <span className="text-muted">· горизонт {t.horizonDays} дн.</span></div>
                  <div className="col-span-2 flex items-center gap-2"><MapPin className="size-4 text-muted" />{t.location}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[7px] border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-2">{url}</code>
                  <Button size="sm" variant="secondary" onClick={() => copy(url)}><Copy /> Скопировать</Button>
                  <Button asChild size="sm" variant="ghost"><a href={`/book/${t.slug}`} target="_blank" rel="noopener"><ExternalLink /> Открыть</a></Button>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(t)}><Pencil /> Изменить</Button>}
                </div>
                <div className="mt-2 text-xs text-muted">Записей через эту страницу за 30 дней: <span className="tnum text-ink">{t.bookings30}</span></div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Типов записи пока нет" description="Создайте, например, «Консультация 30 минут» и отправьте клиентам ссылку." action={canCreate && <Button onClick={() => setEditing({})}><Plus /> Новый тип записи</Button>} />
      )}
      {editing && <BookingTypeDialog initial={editing} users={users} currentUserId={currentUserId} lockUser={lockUser} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BookingTypeDialog({ initial, users, currentUserId, lockUser, onClose }: { initial: Partial<BookingTypeRow>; users: CalUser[]; currentUserId: string; lockUser: boolean; onClose: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [f, setF] = useState<BookingTypeInput>({
    id: initial.id, name: initial.name ?? "", slug: initial.slug ?? "", description: initial.description ?? "", userId: initial.userId ?? currentUserId,
    durationMin: initial.durationMin ?? 30, bufferMin: initial.bufferMin ?? 10, workDays: initial.workDays ?? [1, 2, 3, 4, 5], workStart: initial.workStart ?? "10:00", workEnd: initial.workEnd ?? "18:00",
    horizonDays: initial.horizonDays ?? 14, location: initial.location ?? "Онлайн, ссылка придёт в подтверждении", isActive: initial.isActive ?? true,
  });
  const set = <K extends keyof BookingTypeInput>(k: K, v: BookingTypeInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const translit = (s: string) => {
    const m: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
    return s.toLowerCase().split("").map((ch) => m[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  };
  const submit = () =>
    start(async () => {
      const r = await saveBookingType(f);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(f.id ? "Тип записи обновлён" : "Тип записи создан");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={f.id ? "Тип записи" : "Новый тип записи"} description="Что клиент увидит на публичной странице и когда можно записаться" wide>
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Название" className="sm:col-span-2"><Input value={f.name} onChange={(e) => { set("name", e.target.value); if (!f.id && !f.slug) set("slug", translit(e.target.value)); }} placeholder="Консультация по подбору оборудования" autoFocus required /></Field>
          <Field label="Ссылка" hint="Латиницей: /book/consult"><Input value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="consult" required /></Field>
          <Field label="Сотрудник">
            <Select value={f.userId} onChange={(e) => set("userId", e.target.value)} disabled={lockUser}>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          </Field>
          <Field label="Описание" className="sm:col-span-2"><Textarea value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="30 минут онлайн: разберём помещение и подберём модели" /></Field>
          <Field label="Длительность, мин"><Input type="number" min={10} max={480} step={5} value={f.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))} /></Field>
          <Field label="Буфер между записями, мин"><Input type="number" min={0} max={120} step={5} value={f.bufferMin} onChange={(e) => set("bufferMin", Number(e.target.value))} /></Field>
          <div className="sm:col-span-2">
            <div className="mb-1.5 text-[13px] text-ink-2">Рабочие дни</div>
            <div className="flex flex-wrap gap-1.5">
              {DAY_IDX.map((d, i) => {
                const on = f.workDays.includes(d);
                return <button key={d} type="button" onClick={() => set("workDays", on ? f.workDays.filter((x) => x !== d) : [...f.workDays, d])} className={cn("h-8 w-11 rounded-[7px] border text-[13px] font-medium", on ? "border-ink bg-ink text-canvas" : "border-line-strong text-ink-2 hover:bg-surface-2")}>{DAYS[i]}</button>;
              })}
            </div>
          </div>
          <Field label="Начало приёма"><Input type="time" value={f.workStart} onChange={(e) => set("workStart", e.target.value)} /></Field>
          <Field label="Конец приёма"><Input type="time" value={f.workEnd} onChange={(e) => set("workEnd", e.target.value)} /></Field>
          <Field label="Горизонт записи, дней" hint="На сколько дней вперёд показывать слоты"><Input type="number" min={1} max={90} value={f.horizonDays} onChange={(e) => set("horizonDays", Number(e.target.value))} /></Field>
          <Field label="Где проходит"><Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Онлайн / по адресу клиента / офис" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={f.isActive} onCheckedChange={(v) => set("isActive", v)} /> Страница записи включена</label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Отмена</Button>
            <Button type="submit" disabled={pending}>{f.id ? "Сохранить" : "Создать"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
