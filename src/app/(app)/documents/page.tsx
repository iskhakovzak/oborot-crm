import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, and, ne, inArray } from "drizzle-orm";
import { FileText } from "lucide-react";
import { db, schema } from "@/db";
import type { DocumentType } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtMoney, fmtDate, plural } from "@/lib/format";
import { PageHeader, Stat, EmptyState } from "@/components/ui/page";
import { Table } from "@/components/ui/table";
import { Money } from "@/components/ui/money";
import { Badge } from "@/components/ui/badge";
import { LinkTabs } from "@/components/documents/link-tabs";
import { DocumentsFilters } from "@/components/documents/documents-filters";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import { DocumentActionsMenu } from "@/components/documents/document-actions";
import { DOC_TYPE_LABEL, DOC_TYPE_TONE, DOC_STATUS_LABEL, DOC_STATUS_TONE, EDO_STATUS_LABEL, EDO_STATUS_TONE, type DocStatus, type EdoStatus } from "@/components/documents/labels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Документы" };

const TYPE_TABS: { key: string; label: string }[] = [
  { key: "", label: "Все" }, { key: "invoice", label: "Счета" }, { key: "contract", label: "Договоры" }, { key: "upd", label: "ЭСФ" }, { key: "act", label: "Акты" }, { key: "kp", label: "КП" }, { key: "report", label: "Отчёты" },
];
const TYPES: DocumentType[] = ["invoice", "contract", "upd", "act", "kp", "report"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; edo?: string; q?: string; new?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "documents", "view")) redirect("/");
  const sp = await searchParams;
  const type = TYPES.includes(sp.type as DocumentType) ? (sp.type as DocumentType) : "";

  const rows = await db
    .select({ d: schema.documents, companyName: schema.companies.name, dealNumber: schema.deals.number, dealTitle: schema.deals.title })
    .from(schema.documents)
    .leftJoin(schema.companies, eq(schema.documents.companyId, schema.companies.id))
    .leftJoin(schema.deals, eq(schema.documents.dealId, schema.deals.id))
    .orderBy(desc(schema.documents.createdAt));

  const q = (sp.q ?? "").trim().toLowerCase();
  const list = rows.filter(({ d, companyName }) => {
    if (type && d.type !== type) return false;
    if (sp.status && d.status !== sp.status) return false;
    if (sp.edo && d.edoStatus !== sp.edo) return false;
    if (q && !d.number.toLowerCase().includes(q) && !(companyName ?? "").toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) return false;
    return true;
  });
  const counts = Object.fromEntries(TYPE_TABS.map((t) => [t.key, rows.filter((r) => !t.key || r.d.type === t.key).length]));

  // статистика шапки
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const invoicedMonth = rows.filter((r) => r.d.type === "invoice" && r.d.status !== "cancelled" && r.d.createdAt >= monthStart.toISOString()).reduce((s, r) => s + r.d.amount, 0);
  const unpaid = rows.filter((r) => r.d.type === "invoice" && (r.d.status === "sent" || r.d.status === "draft"));
  const unpaidSum = unpaid.reduce((s, r) => s + r.d.amount, 0);
  const signedEdo = rows.filter((r) => r.d.edoStatus === "signed").length;
  const inEdo = rows.filter((r) => r.d.edoStatus !== "none" && r.d.edoStatus !== "signed" && r.d.edoStatus !== "rejected").length;

  // данные для диалога «Новый документ»
  const canCreate = can(user.actor, "documents", "create");
  const dealOptions = canCreate
    ? (await db.select({ id: schema.deals.id, number: schema.deals.number, title: schema.deals.title, amount: schema.deals.amount, company: schema.companies.name, pipelineKind: schema.pipelines.kind })
        .from(schema.deals).leftJoin(schema.companies, eq(schema.deals.companyId, schema.companies.id)).innerJoin(schema.pipelines, eq(schema.deals.pipelineId, schema.pipelines.id))
        .where(and(eq(schema.pipelines.kind, "sales"), inArray(schema.deals.status, ["open", "won"]))).orderBy(desc(schema.deals.number)))
        .map((d) => ({ id: d.id, number: d.number, title: d.title, amount: d.amount, company: d.company }))
    : [];
  const companyOptions = canCreate ? await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(ne(schema.companies.status, "archived")).orderBy(schema.companies.name) : [];

  return (
    <>
      <PageHeader
        title="Документы"
        description="Счета, договоры, ЭСФ, акты и КП по сделкам, отправка клиенту и в ЭДО."
        actions={<NewDocumentDialog deals={dealOptions} companies={companyOptions} initialType={sp.new} canCreate={canCreate} />}
      />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Выставлено счетов за месяц" value={<Money value={invoicedMonth} compact />} sub={`с ${fmtDate(monthStart.toISOString(), { day: "numeric", month: "long" })}`} />
        <Stat label="Не оплачено" value={<Money value={unpaidSum} compact />} tone={unpaidSum > 0 ? "warn" : undefined} sub={plural(unpaid.length, "счёт", "счёта", "счетов")} />
        <Stat label="Подписано в ЭДО" value={signedEdo} tone="good" sub={inEdo ? `ещё ${plural(inEdo, "документ", "документа", "документов")} в работе` : "все отправленные подписаны"} />
        <Stat label="Всего документов" value={rows.length} sub={`${plural(rows.filter((r) => r.d.type === "report").length, "отчёт", "отчёта", "отчётов")} для клиентов`} />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs active={type} items={TYPE_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `/documents?${new URLSearchParams({ ...(t.key ? { type: t.key } : {}), ...(sp.status ? { status: sp.status } : {}), ...(sp.edo ? { edo: sp.edo } : {}), ...(sp.q ? { q: sp.q } : {}) }).toString()}` }))} />
        <DocumentsFilters />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<FileText />} title="Документов не найдено" description={rows.length ? "Измените фильтры или поисковый запрос." : "Создайте первый документ по сделке."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Номер</th><th>Тип</th><th>Клиент</th><th>Сделка</th><th className="text-right">Сумма</th><th>Дата</th><th>Статус</th><th>ЭДО</th><th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ d, companyName, dealNumber, dealTitle }) => (
              <tr key={d.id}>
                <td><Link href={`/documents/${d.id}`} className="font-medium hover:underline">{d.number}</Link></td>
                <td><Badge tone={DOC_TYPE_TONE[d.type]}>{DOC_TYPE_LABEL[d.type]}</Badge></td>
                <td className="max-w-[260px] truncate">{d.companyId ? <Link href={`/companies/${d.companyId}`} className="hover:underline">{companyName ?? "—"}</Link> : <span className="text-muted">—</span>}</td>
                <td className="max-w-[240px] truncate">{d.dealId ? <Link href={`/deals/${d.dealId}`} className="hover:underline" title={dealTitle ?? ""}>№{dealNumber} · {dealTitle}</Link> : <span className="text-muted">—</span>}</td>
                <td className="text-right tnum font-medium whitespace-nowrap">{fmtMoney(d.amount)}</td>
                <td className="text-muted whitespace-nowrap">{fmtDate(d.createdAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                <td><Badge tone={DOC_STATUS_TONE[d.status as DocStatus]} dot>{DOC_STATUS_LABEL[d.status as DocStatus]}</Badge></td>
                <td>{d.edoStatus === "none" ? <span className="text-muted">—</span> : <Badge tone={EDO_STATUS_TONE[d.edoStatus as EdoStatus]}>{EDO_STATUS_LABEL[d.edoStatus as EdoStatus]}</Badge>}</td>
                <td className="text-right"><DocumentActionsMenu doc={{ id: d.id, type: d.type, status: d.status, edoStatus: d.edoStatus, number: d.number }} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
