"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { createDocumentAction, createReportAction } from "@/app/(app)/documents/actions";
import { DOC_TYPE_LABEL_FULL } from "./labels";
import type { DocumentType } from "@/db/schema";
import { fmtMoney } from "@/lib/format";

export type DealOption = { id: string; number: number; title: string; company: string | null; amount: number };
export type CompanyOption = { id: string; name: string };

const CREATE_TYPES: DocumentType[] = ["invoice", "contract", "upd", "act", "kp"];

export function NewDocumentDialog({ deals, companies, initialType, canCreate }: { deals: DealOption[]; companies: CompanyOption[]; initialType?: string | null; canCreate: boolean }) {
  const router = useRouter();
  const valid = initialType && (CREATE_TYPES.includes(initialType as DocumentType) || initialType === "report");
  const [open, setOpen] = useState(!!valid && canCreate);
  const [type, setType] = useState<DocumentType>(valid ? (initialType as DocumentType) : "invoice");
  const [q, setQ] = useState("");
  const [dealId, setDealId] = useState<string>(deals[0]?.id ?? "");
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const [months, setMonths] = useState(3);
  const [pending, start] = useTransition();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return deals;
    return deals.filter((d) => String(d.number).includes(s) || d.title.toLowerCase().includes(s) || (d.company ?? "").toLowerCase().includes(s));
  }, [deals, q]);
  const effectiveDeal = filtered.some((d) => d.id === dealId) ? dealId : filtered[0]?.id ?? "";
  const close = (o: boolean) => {
    setOpen(o);
    if (!o && initialType) router.replace("/documents");
  };
  const submit = () =>
    start(async () => {
      const r = type === "report" ? await createReportAction({ companyId, months }) : await createDocumentAction({ type, dealId: effectiveDeal });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
        if (r.id) router.push(`/documents/${r.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  if (!canCreate) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus /> Новый документ</Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent title="Новый документ" description="Документ формируется по позициям сделки и реквизитам клиента — PDF готов сразу.">
          <div className="space-y-4">
            <Field label="Тип документа">
              <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
                {CREATE_TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL_FULL[t]}</option>)}
                <option value="report">{DOC_TYPE_LABEL_FULL.report}</option>
              </Select>
            </Field>
            {type === "report" ? (
              <>
                <Field label="Клиент">
                  <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Период, месяцев">
                  <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                    {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Поиск сделки" hint="По номеру, названию или клиенту">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="№ 1024, вентиляция, ООО…" autoFocus />
                </Field>
                <Field label="Сделка">
                  <Select value={effectiveDeal} onChange={(e) => setDealId(e.target.value)} size={Math.min(8, Math.max(3, filtered.length))} className="h-auto py-1 bg-none pr-3">
                    {filtered.map((d) => <option key={d.id} value={d.id}>№{d.number} · {d.title}{d.company ? ` · ${d.company}` : ""} · {fmtMoney(d.amount)}</option>)}
                    {!filtered.length && <option disabled>Сделок не найдено</option>}
                  </Select>
                </Field>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => close(false)}>Отмена</Button>
              <Button onClick={submit} disabled={pending || (type === "report" ? !companyId : !effectiveDeal)}>
                {pending && <Loader2 className="animate-spin" />} Сформировать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
