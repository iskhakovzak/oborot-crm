"use client";
import { useState, useTransition } from "react";
import { Pencil, RefreshCw, Phone, MessageSquare, FileBarChart, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { fmtMoney, phoneFmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateCompany, refreshCompanyByInn, callCompany, messageCompany, clientReport } from "@/app/(app)/companies/actions";
import type { Option } from "@/components/deals/types";
import { CompanyForm, toInput, type CompanyFormValues } from "./company-form";
import { COMPANY_STATUS } from "./status";

export type CompanyHeaderData = CompanyFormValues & { id: string; balance: number; tagsList: string[]; managerName: string | null; managerColor: string | null; createdAt: string };

export function CompanyHeader({ company, users, hidden, readonly, canEdit, canReport, hasPhone }: { company: CompanyHeaderData; users: Option[]; hidden: string[]; readonly: string[]; canEdit: boolean; canReport: boolean; hasPhone: boolean }) {
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<CompanyFormValues>(company);
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [report, setReport] = useState<{ id: string; number: string; summary: string; aiSandbox: boolean } | null>(null);
  const show = (f: string) => !hidden.includes(f);
  const [sl, st] = COMPANY_STATUS[company.status] ?? ["—", "neutral"];

  function save() {
    start(async () => {
      const r = await updateCompany(company.id, toInput(values, hidden, readonly));
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Реквизиты сохранены");
      setEdit(false);
    });
  }
  function refresh() {
    start(async () => {
      const r = await refreshCompanyByInn(company.id);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Реквизиты обновлены: ${r.name}${r.source === "sandbox" ? " (демо-данные)" : ""}`);
    });
  }
  function call() {
    start(async () => {
      const r = await callCompany(company.id);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Звоним на ${phoneFmt(r.phone)}${r.sandbox ? " (демо-режим)" : ""}`);
    });
  }
  function sendMsg() {
    start(async () => {
      const r = await messageCompany(company.id, msgText);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Отправлено (${r.channel})${r.sandbox ? " — демо" : ""}`);
      setMsgText(""); setMsgOpen(false);
    });
  }
  function makeReport() {
    start(async () => {
      const r = await clientReport(company.id, 3);
      if ("error" in r) { toast.error(r.error); return; }
      setReport(r);
    });
  }

  const req: [string, string | null | undefined][] = [
    ...(show("inn") ? [["ИНН", company.inn ?? ""] as [string, string]] : []),
    ["Рег. номер", company.regNumber], ["ОКЭД", company.oked], ["Руководитель", [company.directorPosition, company.director].filter(Boolean).join(": ")],
    ["Юр. адрес", company.legalAddress], ["Факт. адрес", company.address],
    ...(show("phone") ? [["Телефон", phoneFmt(company.phone)] as [string, string]] : []),
    ...(show("email") ? [["Email", company.email] as [string, string]] : []),
    ["Сайт", company.website],
    ...(show("bankName") ? [["Банк", [company.bankName, company.mfo ? `МФО ${company.mfo}` : ""].filter(Boolean).join(", ")] as [string, string]] : []),
    ...(show("account") ? [["Р/с", company.account] as [string, string]] : []),
  ];

  return (
    <section className="rounded-[12px] border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <Badge tone={st} dot>{sl}</Badge>
            {company.industry && <span>{company.industry}</span>}
            {company.source && <span>· источник: {company.source}</span>}
          </div>
          <h1 className="mt-1 text-[22px] font-semibold leading-7 tracking-[-0.01em]">{company.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13.5px]">
            {show("balance") && (
              <span className={cn("text-[16px] font-semibold tnum", company.balance < 0 ? "text-accent" : company.balance > 0 ? "text-good" : "text-ink")} title="Баланс: оплаты минус отгрузки">
                {fmtMoney(company.balance)} <span className="text-[12px] font-normal text-muted">баланс</span>
              </span>
            )}
            {show("managerId") && (company.managerName ? <span className="inline-flex items-center gap-2 text-ink-2"><Avatar name={company.managerName} color={company.managerColor ?? undefined} size={22} />{company.managerName}</span> : <span className="text-muted">Менеджер не назначен</span>)}
            {company.tagsList.length > 0 && <span className="flex flex-wrap gap-1">{company.tagsList.map((t) => <Badge key={t} className="px-1.5 py-0 text-[11px] font-normal">{t}</Badge>)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={call} disabled={pending || !hasPhone} title={hasPhone ? "Позвонить" : "Нет телефона"}><Phone /> Позвонить</Button>
          <Button variant="secondary" onClick={() => setMsgOpen(true)} disabled={pending}><MessageSquare /> Написать</Button>
          {canReport && <Button variant="secondary" onClick={makeReport} disabled={pending}><FileBarChart /> Отчёт для клиента</Button>}
          {canEdit && <Button onClick={() => { setValues(company); setEdit(true); }} disabled={pending}><Pencil /> Изменить</Button>}
        </div>
      </div>
      <div className="border-t border-line px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Реквизиты</h2>
          {canEdit && show("inn") && company.inn && <Button size="sm" variant="ghost" onClick={refresh} disabled={pending}><RefreshCw className={cn(pending && "animate-spin")} /> Обновить по ИНН</Button>}
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2 xl:grid-cols-3">
          {req.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted">{k}</dt>
              <dd className={cn("min-w-0 break-words", /ИНН|Рег\. номер|ОКЭД|Р\/с|Телефон/.test(k) && "tnum", !v && "text-muted")}>{v && v !== "—" ? v : "—"}</dd>
            </div>
          ))}
        </dl>
        {show("notes") && company.notes && <p className="mt-3 whitespace-pre-wrap rounded-[8px] bg-warn-soft/60 px-3 py-2 text-[13px] text-ink-2">{company.notes}</p>}
      </div>

      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent title="Реквизиты клиента" wide>
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <CompanyForm values={values} onChange={setValues} users={users} hidden={hidden} readonly={readonly} />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEdit(false)}>Отмена</Button>
              <Button type="submit" disabled={pending || !values.name.trim()}>{pending ? "Сохраняем…" : "Сохранить"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent title="Написать клиенту" description="Сообщение уйдёт в канал, где клиент уже переписывался, или в первый заполненный контакт">
          <Field label="Текст"><Textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} autoFocus placeholder="Здравствуйте!…" /></Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMsgOpen(false)}>Отмена</Button>
            <Button onClick={sendMsg} disabled={pending || !msgText.trim()}>Отправить</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent title={report ? `Отчёт для клиента ${report.number}` : "Отчёт"} description="Заказы, оплаты, документы и баланс за 3 месяца — PDF готов к отправке">
          {report && (
            <>
              <div className="rounded-[10px] border border-line bg-surface-2 p-3 text-[13px] leading-relaxed">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-violet"><Sparkles className="size-3.5" /> ИИ-резюме{report.aiSandbox ? " (демо-режим, без ключа ИИ)" : ""}</div>
                {report.summary}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setReport(null)}>Закрыть</Button>
                <Button asChild><a href={`/api/documents/${report.id}/pdf`} target="_blank" rel="noreferrer"><ExternalLink /> Открыть PDF</a></Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
