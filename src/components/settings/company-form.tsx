"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CompanyProfile } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Section } from "@/components/ui/page";
import { saveCompany } from "@/app/(app)/settings/actions";

export function CompanyForm({ initial, canEdit }: { initial: CompanyProfile; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const set = (k: keyof CompanyProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveCompany({ ...v, vatRate: Number(v.vatRate) });
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Реквизиты сохранены");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Section title="Реквизиты продавца" description="Подставляются в счета, договоры, УПД, акты и КП">
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Полное название" className="sm:col-span-2"><Input value={v.name} onChange={set("name")} required /></Field>
          <Field label="Короткое название" hint="Используется в сообщениях клиентам: {{company.name}}"><Input value={v.shortName} onChange={set("shortName")} /></Field>
          <Field label="ИНН"><Input value={v.inn} onChange={set("inn")} inputMode="numeric" /></Field>
          <Field label="КПП"><Input value={v.kpp} onChange={set("kpp")} inputMode="numeric" /></Field>
          <Field label="ОГРН"><Input value={v.ogrn} onChange={set("ogrn")} inputMode="numeric" /></Field>
          <Field label="Юридический адрес" className="sm:col-span-2"><Input value={v.address} onChange={set("address")} /></Field>
          <Field label="Руководитель"><Input value={v.director} onChange={set("director")} /></Field>
          <Field label="Должность руководителя"><Input value={v.directorPosition} onChange={set("directorPosition")} /></Field>
          <Field label="Главный бухгалтер"><Input value={v.accountant} onChange={set("accountant")} /></Field>
          <Field label="Телефон"><Input value={v.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><Input value={v.email} onChange={set("email")} type="email" /></Field>
        </fieldset>
      </Section>
      <Section title="Банк и НДС">
        <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Банк" className="sm:col-span-2"><Input value={v.bankName} onChange={set("bankName")} /></Field>
          <Field label="БИК"><Input value={v.bik} onChange={set("bik")} inputMode="numeric" /></Field>
          <Field label="Расчётный счёт"><Input value={v.account} onChange={set("account")} inputMode="numeric" /></Field>
          <Field label="Корр. счёт"><Input value={v.corrAccount} onChange={set("corrAccount")} inputMode="numeric" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Плательщик НДС">
              <Select value={v.vatPayer ? "1" : "0"} onChange={(e) => setV((x) => ({ ...x, vatPayer: e.target.value === "1" }))}>
                <option value="1">Да</option>
                <option value="0">Нет (УСН)</option>
              </Select>
            </Field>
            <Field label="Ставка НДС, %"><Input type="number" min={0} max={100} value={v.vatRate} onChange={(e) => setV((x) => ({ ...x, vatRate: Number(e.target.value) }))} disabled={!v.vatPayer} /></Field>
          </div>
        </fieldset>
      </Section>
      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>Сохранить реквизиты</Button>
        </div>
      )}
    </form>
  );
}
