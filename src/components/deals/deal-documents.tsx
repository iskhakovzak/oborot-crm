"use client";
import { useTransition } from "react";
import { FileText, FileSignature, FileCheck, ClipboardList, Presentation, ExternalLink, Send, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Section } from "@/components/ui/page";
import { fmtMoney, fmtDate } from "@/lib/format";
import { createDealDocument, sendDealDocument, sendPaymentLink } from "@/app/(app)/deals/actions";
import type { DocumentType } from "@/db/schema";

export type DealDocRow = { id: string; type: DocumentType; number: string; title: string; amount: number; status: "draft" | "sent" | "signed" | "paid" | "cancelled"; edoStatus: "none" | "queued" | "sent" | "delivered" | "signed" | "rejected"; sentAt: string | null; createdAt: string };
export type PaymentLinkRow = { id: string; amount: number; url: string; status: "active" | "paid" | "expired" | "cancelled"; createdAt: string; documentId: string | null };

const STATUS: Record<DealDocRow["status"], [string, Tone]> = { draft: ["Черновик", "neutral"], sent: ["Отправлен", "info"], signed: ["Подписан", "good"], paid: ["Оплачен", "good"], cancelled: ["Отменён", "accent"] };
const EDO: Record<DealDocRow["edoStatus"], [string, Tone] | null> = { none: null, queued: ["ЭДО: в очереди", "neutral"], sent: ["ЭДО: отправлен", "info"], delivered: ["ЭДО: доставлен", "info"], signed: ["ЭДО: подписан", "good"], rejected: ["ЭДО: отклонён", "accent"] };
const LINK: Record<PaymentLinkRow["status"], [string, Tone]> = { active: ["Ожидает оплаты", "warn"], paid: ["Оплачена", "good"], expired: ["Истекла", "neutral"], cancelled: ["Отменена", "neutral"] };

const ACTIONS: { type: Exclude<DocumentType, "report">; label: string; icon: React.ReactNode }[] = [
  { type: "invoice", label: "Счёт", icon: <FileText /> },
  { type: "contract", label: "Договор", icon: <FileSignature /> },
  { type: "upd", label: "УПД", icon: <FileCheck /> },
  { type: "act", label: "Акт", icon: <ClipboardList /> },
  { type: "kp", label: "КП", icon: <Presentation /> },
];

export function DealDocuments({ dealId, documents, links, canCreate, canSend }: { dealId: string; documents: DealDocRow[]; links: PaymentLinkRow[]; canCreate: boolean; canSend: boolean }) {
  const [pending, start] = useTransition();
  function create(type: Exclude<DocumentType, "report">) {
    start(async () => {
      const r = await createDealDocument(dealId, type);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`${r.title} сформирован`, { action: { label: "Открыть PDF", onClick: () => window.open(`/api/documents/${r.id}/pdf`, "_blank") } });
    });
  }
  function send(id: string) {
    start(async () => {
      const r = await sendDealDocument(id);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(`Отправлено клиенту${r.channel ? ` (${r.channel})` : ""}${r.sandbox ? " — демо-режим" : ""}`);
    });
  }
  function payLink(documentId?: string | null) {
    start(async () => {
      const r = await sendPaymentLink(dealId, documentId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(r.sent ? `Ссылка на оплату отправлена (${r.channel})` : "Ссылка на оплату создана, но отправить не удалось — нет контактов", { action: { label: "Открыть", onClick: () => window.open(r.url, "_blank") } });
    });
  }
  return (
    <Section
      title="Документы"
      description="Счёт, договор, УПД, акт и КП формируются по позициям сделки в один клик"
      action={canCreate && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {ACTIONS.map((a) => (
            <Button key={a.type} size="sm" variant="secondary" onClick={() => create(a.type)} disabled={pending}>{a.icon}{a.label}</Button>
          ))}
          <Button size="sm" onClick={() => payLink(null)} disabled={pending}><QrCode /> Ссылка на оплату СБП</Button>
        </div>
      )}
    >
      {!documents.length && !links.length ? (
        <div className="rounded-[10px] border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">Документов пока нет. Нажмите «Счёт» или «КП» — PDF будет готов сразу.</div>
      ) : (
        <ul className="divide-y divide-line -my-2">
          {documents.map((d) => {
            const [sl, st] = STATUS[d.status];
            const edo = EDO[d.edoStatus];
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.title}</span>
                    <Badge tone={st}>{sl}</Badge>
                    {edo && <Badge tone={edo[1]}>{edo[0]}</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted tnum">{fmtMoney(d.amount)} · {fmtDate(d.createdAt)}{d.sentAt ? ` · отправлен ${fmtDate(d.sentAt)}` : ""}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" asChild><a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer"><ExternalLink /> PDF</a></Button>
                  {canSend && <Button size="sm" variant="secondary" onClick={() => send(d.id)} disabled={pending}><Send /> Отправить</Button>}
                  {canSend && d.type === "invoice" && d.status !== "paid" && <Button size="sm" variant="secondary" onClick={() => payLink(d.id)} disabled={pending}><QrCode /> СБП</Button>}
                </div>
              </li>
            );
          })}
          {links.map((l) => {
            const [ll, lt] = LINK[l.status];
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><QrCode className="size-4 text-muted" /><span className="font-medium">Ссылка на оплату СБП</span><Badge tone={lt}>{ll}</Badge></div>
                  <div className="mt-0.5 text-xs text-muted tnum">{fmtMoney(l.amount)} · {fmtDate(l.createdAt)}</div>
                </div>
                <Button size="sm" variant="ghost" asChild><a href={l.url} target="_blank" rel="noreferrer"><ExternalLink /> Открыть</a></Button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
