"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Send, FileSignature, BadgeCheck, Ban, MoreHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/input";
import { cancelDocumentAction, markPaidAction, sendDocumentAction, sendToEdoAction, updateEdoStatusAction } from "@/app/(app)/documents/actions";
import { EDO_TYPES, type DocStatus, type EdoStatus } from "./labels";
import type { DocumentType } from "@/db/schema";

export type DocActionTarget = { id: string; type: DocumentType; status: DocStatus; edoStatus: EdoStatus; number: string };
type Result = { ok: true; message: string; id?: string } | { ok: false; error: string };

export function useDocumentActions(doc: DocActionTarget, opts?: { onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paidOpen, setPaidOpen] = useState(false);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
      router.refresh();
      opts?.onDone?.();
    });
  const canSend = doc.status !== "cancelled";
  const canEdo = EDO_TYPES.includes(doc.type) && doc.status !== "cancelled" && (doc.edoStatus === "none" || doc.edoStatus === "rejected");
  const canPay = doc.type === "invoice" && doc.status !== "paid" && doc.status !== "cancelled";
  const canCancel = doc.status !== "paid" && doc.status !== "cancelled";
  const edoDemo = doc.edoStatus !== "none" && doc.edoStatus !== "signed" && doc.edoStatus !== "rejected";
  return {
    pending, run, canSend, canEdo, canPay, canCancel, edoDemo, paidOpen, setPaidOpen,
    send: () => run(() => sendDocumentAction(doc.id)),
    edo: () => run(() => sendToEdoAction(doc.id)),
    cancel: () => run(() => cancelDocumentAction(doc.id)),
    pay: (method: "bank" | "sbp") => run(() => markPaidAction(doc.id, method)),
    edoStatus: (s: "delivered" | "signed" | "rejected") => run(() => updateEdoStatusAction(doc.id, s)),
  };
}

export function MarkPaidDialog({ doc, open, onOpenChange, onConfirm, pending }: { doc: DocActionTarget; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (m: "bank" | "sbp") => void; pending: boolean }) {
  const [method, setMethod] = useState<"bank" | "sbp">("bank");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Отметить оплаченным" description={`Счёт ${doc.number}: будет создан платёж, обновлён баланс клиента и запущены автоматизации «оплата поступила».`}>
        <div className="space-y-4">
          <Field label="Способ оплаты">
            <Select value={method} onChange={(e) => setMethod(e.target.value as "bank" | "sbp")}>
              <option value="bank">Банковский перевод</option>
              <option value="sbp">Payme/Click</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button onClick={() => { onConfirm(method); onOpenChange(false); }} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Провести оплату
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Выпадающее меню действий в реестре */
export function DocumentActionsMenu({ doc }: { doc: DocActionTarget }) {
  const a = useDocumentActions(doc);
  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="iconSm" aria-label="Действия" disabled={a.pending}>
            {a.pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem asChild><a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noopener"><ExternalLink /> Открыть PDF</a></DropdownItem>
          {a.canSend && <DropdownItem onSelect={a.send}><Send /> Отправить клиенту</DropdownItem>}
          {a.canEdo && <DropdownItem onSelect={a.edo}><FileSignature /> Отправить в ЭДО</DropdownItem>}
          {a.canPay && <DropdownItem onSelect={() => a.setPaidOpen(true)}><BadgeCheck /> Отметить оплаченным</DropdownItem>}
          {a.canCancel && (
            <>
              <DropdownSeparator />
              <DropdownItem danger onSelect={a.cancel}><Ban /> Отменить</DropdownItem>
            </>
          )}
        </DropdownContent>
      </Dropdown>
      <MarkPaidDialog doc={doc} open={a.paidOpen} onOpenChange={a.setPaidOpen} onConfirm={a.pay} pending={a.pending} />
    </>
  );
}

/** Панель кнопок в карточке документа */
export function DocumentActionButtons({ doc, edoLive }: { doc: DocActionTarget; edoLive: boolean }) {
  const a = useDocumentActions(doc);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" asChild><a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noopener"><ExternalLink /> Открыть PDF</a></Button>
        {a.canSend && <Button onClick={a.send} disabled={a.pending}><Send /> Отправить клиенту</Button>}
        {a.canEdo && <Button variant="secondary" onClick={a.edo} disabled={a.pending}><FileSignature /> Отправить в ЭДО</Button>}
        {a.canPay && <Button variant="good" onClick={() => a.setPaidOpen(true)} disabled={a.pending}><BadgeCheck /> Отметить оплаченным</Button>}
        {a.canCancel && <Button variant="ghost" onClick={a.cancel} disabled={a.pending}><Ban /> Отменить</Button>}
      </div>
      {a.edoDemo && (
        <div className="rounded-[10px] border border-dashed border-line-strong p-3">
          <div className="text-xs text-muted mb-2">
            {edoLive ? "Статусы ЭДО приходят от провайдера автоматически; кнопки ниже — для ручного подтверждения." : "Демо-режим ЭДО: имитация ответов контрагента."}
          </div>
          <div className="flex flex-wrap gap-2">
            {doc.edoStatus !== "delivered" && <Button size="sm" variant="secondary" onClick={() => a.edoStatus("delivered")} disabled={a.pending}>Контрагент получил</Button>}
            <Button size="sm" variant="good" onClick={() => a.edoStatus("signed")} disabled={a.pending}>Контрагент подписал</Button>
            <Button size="sm" variant="danger" onClick={() => a.edoStatus("rejected")} disabled={a.pending}>Отклонил</Button>
          </div>
        </div>
      )}
      <MarkPaidDialog doc={doc} open={a.paidOpen} onOpenChange={a.setPaidOpen} onConfirm={a.pay} pending={a.pending} />
    </div>
  );
}
