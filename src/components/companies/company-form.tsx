"use client";
import { useState } from "react";
import { Search, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { CompanyInput } from "@/app/(app)/companies/actions";
import type { Option } from "@/components/deals/types";
import { SOURCES } from "@/components/deals/types";

export type CompanyFormValues = {
  name: string; shortName: string; inn: string; oked: string; regNumber: string; legalAddress: string; address: string; director: string; directorPosition: string;
  bankName: string; mfo: string; account: string; email: string; phone: string; website: string; industry: string; status: "lead" | "client" | "partner" | "archived"; source: string; managerId: string; tags: string; notes: string;
};

export const EMPTY_COMPANY: CompanyFormValues = { name: "", shortName: "", inn: "", oked: "", regNumber: "", legalAddress: "", address: "", director: "", directorPosition: "", bankName: "", mfo: "", account: "", email: "", phone: "", website: "", industry: "", status: "lead", source: "", managerId: "", tags: "", notes: "" };

export function toInput(v: CompanyFormValues, hidden: string[], readonly: string[]): CompanyInput {
  const out: CompanyInput = { name: v.name, shortName: v.shortName, inn: v.inn, oked: v.oked, regNumber: v.regNumber, legalAddress: v.legalAddress, address: v.address, director: v.director, directorPosition: v.directorPosition, bankName: v.bankName, mfo: v.mfo, account: v.account, email: v.email, phone: v.phone, website: v.website, industry: v.industry, status: v.status, source: v.source, managerId: v.managerId || null, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), notes: v.notes };
  for (const k of [...hidden, ...readonly]) delete (out as Record<string, unknown>)[k];
  return out;
}

const STATUSES: { value: CompanyFormValues["status"]; label: string }[] = [{ value: "lead", label: "Лид" }, { value: "client", label: "Клиент" }, { value: "partner", label: "Партнёр" }, { value: "archived", label: "Архив" }];

export function CompanyForm({ values, onChange, users, hidden, readonly, autoFocusInn }: { values: CompanyFormValues; onChange: (v: CompanyFormValues) => void; users: Option[]; hidden: string[]; readonly: string[]; autoFocusInn?: boolean }) {
  const [busy, setBusy] = useState<"inn" | "mfo" | null>(null);
  const set = (patch: Partial<CompanyFormValues>) => onChange({ ...values, ...patch });
  const show = (f: string) => !hidden.includes(f);
  const ro = (f: string) => readonly.includes(f);

  async function fillByInn() {
    const inn = values.inn.replace(/\D/g, "");
    if (!inn) return toast.error("Введите ИНН");
    setBusy("inn");
    try {
      const res = await fetch(`/api/lookup/inn?inn=${inn}`);
      const j = await res.json();
      if (!res.ok) return toast.error(j.error ?? "Не удалось получить данные");
      set({ name: j.name ?? values.name, shortName: j.shortName ?? values.shortName, inn: j.inn ?? inn, oked: j.oked ?? "", regNumber: j.regNumber ?? "", legalAddress: j.legalAddress ?? "", director: j.director ?? "", directorPosition: j.directorPosition ?? "" });
      toast.success(`${j.name} — ${j.status}${j.source === "sandbox" ? " (демо-данные)" : ""}`);
    } catch {
      toast.error("Сервис недоступен");
    } finally {
      setBusy(null);
    }
  }
  async function fillByMfo() {
    const mfo = values.mfo.replace(/\D/g, "");
    if (mfo.length !== 5) return toast.error("МФО состоит из 5 цифр");
    setBusy("mfo");
    try {
      const res = await fetch(`/api/lookup/mfo?mfo=${mfo}`);
      const j = await res.json();
      if (!res.ok) return toast.error(j.error ?? "Банк не найден");
      set({ bankName: j.bankName });
      toast.success(j.bankName);
    } catch {
      toast.error("Сервис недоступен");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {show("inn") && (
        <Field label="ИНН" hint="9 цифр (ИНН/СТИР). По ИНН подтянутся реквизиты из реестра ЮЛ (soliq.uz).">
          <div className="flex gap-2">
            <Input value={values.inn} onChange={(e) => set({ inn: e.target.value })} inputMode="numeric" placeholder="301234567" autoFocus={autoFocusInn} className="tnum" disabled={ro("inn")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillByInn(); } }} />
            <Button variant="secondary" onClick={fillByInn} disabled={busy === "inn" || !values.inn.trim()} className="shrink-0"><Search /> {busy === "inn" ? "Ищем…" : "Заполнить по ИНН"}</Button>
          </div>
        </Field>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_1fr]">
        <Field label="Название"><Input value={values.name} onChange={(e) => set({ name: e.target.value })} required placeholder="ООО «Ромашка»" disabled={ro("name")} /></Field>
        <Field label="Короткое имя"><Input value={values.shortName} onChange={(e) => set({ shortName: e.target.value })} placeholder="Ромашка" /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="ОКЭД"><Input value={values.oked} onChange={(e) => set({ oked: e.target.value })} className="tnum" placeholder="46.90" /></Field>
        <Field label="Рег. номер"><Input value={values.regNumber} onChange={(e) => set({ regNumber: e.target.value })} className="tnum" /></Field>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Руководитель"><Input value={values.director} onChange={(e) => set({ director: e.target.value })} placeholder="Иванов Иван Иванович" /></Field>
        <Field label="Должность"><Input value={values.directorPosition} onChange={(e) => set({ directorPosition: e.target.value })} placeholder="Директор" /></Field>
      </div>
      <Field label="Юридический адрес"><Input value={values.legalAddress} onChange={(e) => set({ legalAddress: e.target.value })} placeholder="г. Ташкент, ул. Амира Темура, 1" /></Field>
      <Field label="Фактический адрес"><Input value={values.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {show("phone") && <Field label="Телефон"><Input value={values.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+998 90 123-45-67" disabled={ro("phone")} /></Field>}
        {show("email") && <Field label="Email"><Input value={values.email} onChange={(e) => set({ email: e.target.value })} type="email" disabled={ro("email")} /></Field>}
        <Field label="Сайт"><Input value={values.website} onChange={(e) => set({ website: e.target.value })} placeholder="example.uz" /></Field>
      </div>
      {(show("bankName") || show("account")) && (
        <div className="rounded-[10px] border border-line bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><Landmark className="size-4 text-muted" /> Банковские реквизиты</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_2fr]">
            <Field label="МФО">
              <div className="flex gap-1.5">
                <Input value={values.mfo} onChange={(e) => set({ mfo: e.target.value })} inputMode="numeric" className="tnum" placeholder="01088" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillByMfo(); } }} />
                <Button variant="secondary" size="icon" onClick={fillByMfo} disabled={busy === "mfo"} aria-label="Найти банк по МФО" className="shrink-0"><Search /></Button>
              </div>
            </Field>
            {show("bankName") && <Field label="Банк"><Input value={values.bankName} onChange={(e) => set({ bankName: e.target.value })} disabled={ro("bankName")} /></Field>}
          </div>
          {show("account") && (
            <div className="mt-3">
              <Field label="Расчётный счёт" hint="20 цифр"><Input value={values.account} onChange={(e) => set({ account: e.target.value })} className="tnum" inputMode="numeric" disabled={ro("account")} /></Field>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Статус">
          <Select value={values.status} onChange={(e) => set({ status: e.target.value as CompanyFormValues["status"] })}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
        {show("managerId") && (
          <Field label="Менеджер">
            <Select value={values.managerId} onChange={(e) => set({ managerId: e.target.value })} disabled={ro("managerId")}>
              <option value="">Автоматически</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Источник">
          <Select value={values.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="">Не указан</option>
            {[...new Set([values.source, ...SOURCES].filter(Boolean))].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Отрасль"><Input value={values.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="Строительство" /></Field>
        <Field label="Теги" hint="Через запятую: vip, опт, horeca"><Input value={values.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
      </div>
      {show("notes") && <Field label="Заметки"><Textarea value={values.notes} onChange={(e) => set({ notes: e.target.value })} disabled={ro("notes")} /></Field>}
    </div>
  );
}
