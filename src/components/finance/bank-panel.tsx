"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/input";
import { linkTransactionAction, loadStatementAction } from "@/app/(app)/finance/actions";
import { fmtMoney } from "@/lib/format";
import type { FinanceOptions } from "./types";

export function LoadStatementButton({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  return (
    <Button
      onClick={() => start(async () => { const r = await loadStatementAction(); if (r.ok) toast.success(r.message); else toast.error(r.error); router.refresh(); })}
      disabled={pending}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Download />} Загрузить выписку
    </Button>
  );
}

export function LinkTransactionDialog({ tx, options }: { tx: { id: string; amount: number; direction: "in" | "out"; counterpartyName: string | null; counterpartyInn: string | null; purpose: string | null }; options: FinanceOptions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState(options.companies[0]?.id ?? "");
  const [documentId, setDocumentId] = useState("");
  const [pending, start] = useTransition();
  const invoices = useMemo(() => options.invoices.filter((i) => i.companyId === companyId && i.status !== "paid" && i.status !== "cancelled"), [options.invoices, companyId]);
  const submit = () =>
    start(async () => {
      const r = await linkTransactionAction({ txId: tx.id, companyId, documentId: documentId || null });
      if (r.ok) { toast.success(r.message); setOpen(false); router.refresh(); } else toast.error(r.error);
    });
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Link2 /> Привязать</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Привязать операцию" description={`${tx.direction === "in" ? "Поступление" : "Списание"} ${fmtMoney(tx.amount)} · ${tx.counterpartyName ?? "контрагент"}${tx.counterpartyInn ? ` · ИНН ${tx.counterpartyInn}` : ""}`}>
          <div className="space-y-4">
            {tx.purpose && <p className="text-[13px] text-ink-2 rounded-[8px] bg-surface-2 px-3 py-2">{tx.purpose}</p>}
            <Field label="Клиент">
              <Select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setDocumentId(""); }}>
                {options.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            {tx.direction === "in" && (
              <Field label="Счёт (необязательно)" hint="Выбранный счёт будет отмечен оплаченным">
                <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                  <option value="">Без счёта — зачислить на баланс</option>
                  {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {fmtMoney(i.amount)}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
              <Button onClick={submit} disabled={pending || !companyId}>{pending && <Loader2 className="animate-spin" />} Привязать</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
