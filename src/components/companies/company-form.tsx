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
  name: string; shortName: string; inn: string; kpp: string; ogrn: string; okved: string; legalAddress: string; address: string; director: string; directorPosition: string;
  bankName: string; bik: string; account: string; corrAccount: string; email: string; phone: string; website: string; industry: string; status: "lead" | "client" | "partner" | "archived"; source: string; managerId: string; tags: string; notes: string;
};

export const EMPTY_COMPANY: CompanyFormValues = { name: "", shortName: "", inn: "", kpp: "", ogrn: "", okved: "", legalAddress: "", address: "", director: "", directorPosition: "", bankName: "", bik: "", account: "", corrAccount: "", email: "", phone: "", website: "", industry: "", status: "lead", source: "", managerId: "", tags: "", notes: "" };

export function toInput(v: CompanyFormValues, hidden: string[], readonly: string[]): CompanyInput {
  const out: CompanyInput = { name: v.name, shortName: v.shortName, inn: v.inn, kpp: v.kpp, ogrn: v.ogrn, okved: v.okved, legalAddress: v.legalAddress, address: v.address, director: v.director, directorPosition: v.directorPosition, bankName: v.bankName, bik: v.bik, account: v.account, corrAccount: v.corrAccount, email: v.email, phone: v.phone, website: v.website, industry: v.industry, status: v.status, source: v.source, managerId: v.managerId || null, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean), notes: v.notes };
  for (const k of [...hidden, ...readonly]) delete (out as Record<string, unknown>)[k];
  return out;
}

const STATUSES: { value: CompanyFormValues["status"]; label: string }[] = [{ value: "lead", label: "Лид" }, { value: "client", label: "Клиент" }, { value: "partner", label: "Партнёр" }, { value: "archived", label: "Архив" }];

export function CompanyForm({ values, onChange, users, hidden, readonly, autoFocusInn }: { values: CompanyFormValues; onChange: (v: CompanyFormValues) => void; users: Option[]; hidden: string[]; readonly: string[]; autoFocusInn?: boolean }) {
  const [busy, setBusy] = useState<"inn" | "bik" | null>(null);
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
      set({ name: j.name ?? values.name, shortName: j.shortName ?? values.shortName, inn: j.inn ?? inn, kpp: j.kpp ?? "", ogrn: j.ogrn ?? "", okved: j.okved ?? "", legalAddress: j.legalAddress ?? "", director: j.director ?? "", directorPosition: j.directorPosition ?? "" });
      toast.success(`${j.name} — ${j.status}${j.source === "sandbox" ? " (демо-данные)" : ""}`);
    } catch {
      toast.error("Сервис недоступен");
    } finally {
      setBusy(null);
    }
  }
  async function fillByBik() {
    const bik = values.bik.replace(/\D/g, "");
    if (bik.length !== 9) return toast.error("БИК состоит из 9 цифр");
    setBusy("bik");
    try {
      const res = await fetch(`/api/lookup/bik?bik=${bik}`);
      const j = await res.json();
      if (!res.ok) return toast.error(j.error ?? "Банк не найден");
      set({ bankName: j.bankName, corrAccount: j.corrAccount });
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
        <Field label="ИНН" hint="10 цифр для юрлица, 12 — для ИП. По ИНН подтянутся реквизиты из ЕГРЮЛ.">
          <div className="flex gap-2">
            <Input value={values.inn} onChange={(e) => set({ inn: e.target.value })} inputMode="numeric" placeholder="7707083893" autoFocus={autoFocusInn} className="tnum" disabled={ro("inn")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillByInn(); } }} />
            <Button variant="secondary" onClick={fillByInn} disabled={busy === "inn" || !values.inn.trim()} className="shrink-0"><Search /> {busy === "inn" ? "Ищем…" : "Заполнить по ИНН"}</Button>
          </div>
        </Field>
      )}
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <Field label="Название"><Input value={values.name} onChange={(e) => set({ name: e.target.value })} required placeholder="ООО «Ромашка»" disabled={ro("name")} /></Field>
        <Field label="Короткое имя"><Input value={values.shortName} onChange={(e) => set({ shortName: e.target.value })} placeholder="Ромашка" /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="КПП"><Input value={values.kpp} onChange={(e) => set({ kpp: e.target.value })} className="tnum" /></Field>
        <Field label="ОГРН"><Input value={values.ogrn} onChange={(e) => set({ ogrn: e.target.value })} className="tnum" /></Field>
        <Field label="ОКВЭД"><Input value={values.okved} onChange={(e) => set({ okved: e.target.value })} className="tnum" /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Руководитель"><Input value={values.director} onChange={(e) => set({ director: e.target.value })} placeholder="Иванов Иван Иванович" /></Field>
        <Field label="Должность"><Input value={values.directorPosition} onChange={(e) => set({ directorPosition: e.target.value })} placeholder="Генеральный директор" /></Field>
      </div>
      <Field label="Юридический адрес"><Input value={values.legalAddress} onChange={(e) => set({ legalAddress: e.target.value })} /></Field>
      <Field label="Фактический адрес"><Input value={values.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        {show("phone") && <Field label="Телефон"><Input value={values.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+7 495 000-00-00" disabled={ro("phone")} /></Field>}
        {show("email") && <Field label="Email"><Input value={values.email} onChange={(e) => set({ email: e.target.value })} type="email" disabled={ro("email")} /></Field>}
        <Field label="Сайт"><Input value={values.website} onChange={(e) => set({ website: e.target.value })} placeholder="example.ru" /></Field>
      </div>
      {(show("bankName") || show("account")) && (
        <div className="rounded-[10px] border border-line bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><Landmark className="size-4 text-muted" /> Банковские реквизиты</div>
          <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
            <Field label="БИК">
              <div className="flex gap-1.5">
                <Input value={values.bik} onChange={(e) => set({ bik: e.target.value })} inputMode="numeric" className="tnum" placeholder="044525225" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fillByBik(); } }} />
                <Button variant="secondary" size="icon" onClick={fillByBik} disabled={busy === "bik"} aria-label="Найти банк по БИК" className="shrink-0"><Search /></Button>
              </div>
            </Field>
            {show("bankName") && <Field label="Банк"><Input value={values.bankName} onChange={(e) => set({ bankName: e.target.value })} disabled={ro("bankName")} /></Field>}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {show("account") && <Field label="Расчётный счёт"><Input value={values.account} onChange={(e) => set({ account: e.target.value })} className="tnum" disabled={ro("account")} /></Field>}
            <Field label="Корр. счёт"><Input value={values.corrAccount} onChange={(e) => set({ corrAccount: e.target.value })} className="tnum" /></Field>
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
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
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Отрасль"><Input value={values.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="Строительство" /></Field>
        <Field label="Теги" hint="Через запятую: vip, опт, horeca"><Input value={values.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
      </div>
      {show("notes") && <Field label="Заметки"><Textarea value={values.notes} onChange={(e) => set({ notes: e.target.value })} disabled={ro("notes")} /></Field>}
    </div>
  );
}
