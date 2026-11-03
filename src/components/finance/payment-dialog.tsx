"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { addPaymentAction } from "@/app/(app)/finance/actions";
import { fmtMoney } from "@/lib/format";
import type { FinanceOptions } from "./types";

export function PaymentDialog({ options }: { options: FinanceOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(options.companies[0]?.id ?? "");
  const [dealId, setDealId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "sbp" | "cash" | "card">("bank");
  const [purpose, setPurpose] = useState("");
  const [pending, start] = useTransition();
  const deals = useMemo(() => options.deals.filter((d) => d.companyId === companyId), [options.deals, companyId]);
  const invoices = useMemo(() => options.invoices.filter((d) => d.companyId === companyId && (!dealId || d.dealId === dealId)), [options.invoices, companyId, dealId]);
  const pickInvoice = (id: string) => {
    setDocumentId(id);
    const inv = options.invoices.find((i) => i.id === id);
    if (inv) { setAmount(String(inv.amount)); setPurpose(`Оплата по счёту ${inv.number}`); if (inv.dealId) setDealId(inv.dealId); }
  };
  const submit = () =>
    start(async () => {
      const r = await addPaymentAction({ companyId, dealId: dealId || null, documentId: documentId || null, amount: Number(amount), method, purpose });
      if (r.ok) { toast.success(r.message); setOpen(false); setAmount(""); setPurpose(""); setDocumentId(""); router.refresh(); }
      else toast.error(r.error);
    });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Внести оплату</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Внести оплату" description="Платёж попадёт в баланс клиента, закроет счёт и запустит автоматизации «оплата поступила».">
          <div className="space-y-4">
            <Field label="Клиент">
              <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setDealId(""); setDocumentId(""); }}>
                {options.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Сделка (необязательно)">
                <Select value={dealId} onChange={(e) => { setDealId(e.target.value); setDocumentId(""); }}>
                  <option value="">—</option>
                  {deals.map((d) => <option key={d.id} value={d.id}>№{d.number} · {d.title}</option>)}
                </Select>
              </Field>
              <Field label="Счёт (необязательно)">
                <Select value={documentId} onChange={(e) => pickInvoice(e.target.value)}>
                  <option value="">—</option>
                  {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {fmtMoney(i.amount)}{i.status === "paid" ? " · оплачен" : ""}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Сумма, сум"><Input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150 000" className="tnum" /></Field>
              <Field label="Способ">
                <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  <option value="bank">Банковский перевод</option><option value="sbp">Payme/Click</option><option value="cash">Наличные</option><option value="card">Карта</option>
                </Select>
              </Field>
            </div>
            <Field label="Назначение"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Оплата по счёту …" /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={submit} disabled={pending || !companyId || !(Number(amount) > 0)}>{pending && <Loader2 className="animate-spin" />} Провести</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
