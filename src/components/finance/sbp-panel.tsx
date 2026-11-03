"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, ExternalLink, Copy, Send, Ban, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { cancelPaymentLinkAction, createPaymentLinkAction, sendPaymentLinkAction } from "@/app/(app)/finance/actions";
import { fmtMoney } from "@/lib/format";
import type { FinanceOptions } from "./types";

export function CreatePaymentLinkDialog({ options }: { options: FinanceOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(options.companies[0]?.id ?? "");
  const [dealId, setDealId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [pending, start] = useTransition();
  const deals = useMemo(() => options.deals.filter((d) => d.companyId === companyId), [options.deals, companyId]);
  const invoices = useMemo(() => options.invoices.filter((i) => i.companyId === companyId && i.status !== "paid" && i.status !== "cancelled"), [options.invoices, companyId]);
  const pickDeal = (id: string) => { setDealId(id); const d = options.deals.find((x) => x.id === id); if (d && !amount) { setAmount(String(d.amount)); setPurpose(`Оплата по сделке №${d.number}`); } };
  const pickInvoice = (id: string) => { setDocumentId(id); const i = options.invoices.find((x) => x.id === id); if (i) { setAmount(String(i.amount)); setPurpose(`Оплата по счёту ${i.number}`); if (i.dealId) setDealId(i.dealId); } };
  const submit = () =>
    start(async () => {
      const r = await createPaymentLinkAction({ companyId, dealId: dealId || null, documentId: documentId || null, amount: Number(amount), purpose });
      if (r.ok) { toast.success(r.message); setOpen(false); setAmount(""); setPurpose(""); router.refresh(); } else toast.error(r.error);
    });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Создать ссылку</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Ссылка на оплату через Payme/Click" description="Клиент оплачивает по QR или ссылке; статус обновится автоматически.">
          <div className="space-y-4">
            <Field label="Клиент">
              <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setDealId(""); setDocumentId(""); }}>
                {options.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Сделка"><Select value={dealId} onChange={(e) => pickDeal(e.target.value)}><option value="">—</option>{deals.map((d) => <option key={d.id} value={d.id}>№{d.number} · {d.title}</option>)}</Select></Field>
              <Field label="Счёт"><Select value={documentId} onChange={(e) => pickInvoice(e.target.value)}><option value="">—</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {fmtMoney(i.amount)}</option>)}</Select></Field>
            </div>
            <Field label="Сумма, сум"><Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="tnum" /></Field>
            <Field label="Назначение"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Оплата по счёту …" /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={submit} disabled={pending || !(Number(amount) > 0)}>{pending && <Loader2 className="animate-spin" />} Создать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PaymentLinkActions({ link, canEdit }: { link: { id: string; url: string; status: string }; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message); else toast.error(r.error); router.refresh(); });
  const copy = async () => { try { await navigator.clipboard.writeText(link.url); toast.success("Ссылка скопирована"); } catch { toast.error("Не удалось скопировать"); } };
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="secondary" asChild><a href={link.url} target="_blank" rel="noopener"><ExternalLink /> Открыть</a></Button>
      <Dropdown>
        <DropdownTrigger asChild><Button variant="ghost" size="iconSm" aria-label="Ещё" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}</Button></DropdownTrigger>
        <DropdownContent>
          <DropdownItem onSelect={copy}><Copy /> Скопировать</DropdownItem>
          {link.status === "active" && <DropdownItem onSelect={() => run(() => sendPaymentLinkAction(link.id))}><Send /> Отправить клиенту</DropdownItem>}
          {canEdit && link.status === "active" && (<><DropdownSeparator /><DropdownItem danger onSelect={() => run(() => cancelPaymentLinkAction(link.id))}><Ban /> Отменить</DropdownItem></>)}
        </DropdownContent>
      </Dropdown>
    </div>
  );
}
