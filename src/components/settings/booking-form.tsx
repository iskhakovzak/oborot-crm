"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BookingSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Section } from "@/components/ui/page";
import { Switch } from "@/components/ui/switch";
import { saveBooking } from "@/app/(app)/settings/actions";

export function BookingForm({ initial, pipelines, bookingUrl, canEdit }: { initial: BookingSettings; pipelines: { id: string; name: string }[]; bookingUrl: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveBooking(v);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Настройки онлайн-записи сохранены");
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Онлайн-запись" description="Клиент выбирает слот на публичной странице, запись попадает в календарь сотрудника, а система подтверждает её сама">
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Канал подтверждения" hint="Куда уходит подтверждение и напоминание клиенту">
            <Select value={v.confirmByChannel} onChange={(e) => setV({ ...v, confirmByChannel: e.target.value as BookingSettings["confirmByChannel"] })}>
              <option value="telegram">Telegram</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Почта</option>
              <option value="sms">SMS</option>
            </Select>
          </Field>
          <Field label="Воронка для заявки из записи">
            <Select value={v.defaultPipelineId ?? ""} onChange={(e) => setV({ ...v, defaultPipelineId: e.target.value || null })} disabled={!v.createLead}>
              <option value="">Воронка продаж (по умолчанию)</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2.5 sm:col-span-2">
            <span>
              <span className="block text-[13px]">Создавать заявку при записи</span>
              <span className="block text-xs text-muted">Новый клиент и сделка появятся в воронке, сработает автоматизация «Клиент записался в календарь»</span>
            </span>
            <Switch checked={v.createLead} onCheckedChange={(createLead) => setV({ ...v, createLead })} />
          </label>
        </fieldset>
        <div className="mt-4 rounded-[8px] bg-surface-2 px-3 py-2 text-[13px]">
          Публичная страница записи: <a href={bookingUrl} target="_blank" rel="noreferrer" className="font-medium text-info hover:underline">{bookingUrl}</a>
          <span className="ml-2 text-xs text-muted">— ссылку можно вставить в подпись, на сайт и в сообщения ({"{{link.booking}}"})</span>
        </div>
      </Section>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>Сохранить</Button>
        </div>
      )}
    </form>
  );
}
