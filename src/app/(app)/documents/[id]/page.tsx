import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { ArrowLeft, FileText, CreditCard, MessageSquare, Phone, Mail, StickyNote, Bot, Workflow, ListChecks } from "lucide-react";
import { db, schema } from "@/db";
import type { ActivityType } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { resolve } from "@/lib/integrations/registry";
import { fmtMoney, fmtDate, fmtDateTime, relTime } from "@/lib/format";
import { PageHeader, Section, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DocumentActionButtons } from "@/components/documents/document-actions";
import { DOC_TYPE_LABEL_FULL, DOC_TYPE_TONE, DOC_TYPE_LABEL, DOC_STATUS_LABEL, DOC_STATUS_TONE, EDO_STATUS_LABEL, EDO_STATUS_TONE, type DocStatus, type EdoStatus } from "@/components/documents/labels";

export const dynamic = "force-dynamic";

const ACT_ICON: Record<ActivityType, React.ComponentType<{ className?: string }>> = { note: StickyNote, call: Phone, email: Mail, message: MessageSquare, stage: Workflow, document: FileText, payment: CreditCard, system: Bot, task: ListChecks, ai: Bot };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-line last:border-0">
      <span className="text-[13px] text-muted shrink-0">{label}</span>
      <span className="text-right text-sm min-w-0 truncate">{children}</span>
    </div>
  );
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "documents", "view")) redirect("/");
  const { id } = await params;
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) notFound();
  const [company, deal, creator, edo] = await Promise.all([
    doc.companyId ? db.query.companies.findFirst({ where: eq(schema.companies.id, doc.companyId) }) : null,
    doc.dealId ? db.query.deals.findFirst({ where: eq(schema.deals.id, doc.dealId) }) : null,
    doc.createdBy ? db.query.users.findFirst({ where: eq(schema.users.id, doc.createdBy) }) : null,
    resolve("edo"),
  ]);
  const activityWhere = doc.dealId && doc.companyId ? or(eq(schema.activities.dealId, doc.dealId), eq(schema.activities.companyId, doc.companyId)) : doc.dealId ? eq(schema.activities.dealId, doc.dealId) : doc.companyId ? eq(schema.activities.companyId, doc.companyId) : undefined;
  const activityRows = activityWhere
    ? await db.select({ a: schema.activities, userName: schema.users.name, userColor: schema.users.color }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.userId, schema.users.id)).where(activityWhere).orderBy(desc(schema.activities.createdAt)).limit(300)
    : [];
  const activities = activityRows.filter(({ a }) => (a.meta as { documentId?: string } | null)?.documentId === id);
  const payments = await db.query.payments.findMany({ where: eq(schema.payments.documentId, id), orderBy: desc(schema.payments.paidAt) });
  const payload = (doc.payload ?? {}) as { summary?: string; period?: string; aiSandbox?: boolean; lines?: { name: string; qty: number; unit: string; price: number }[] };
  const edoProviderName = doc.edoProvider ? ({ didox: "Didox", faktura: "Faktura.uz", diadoc: "Didox", sbis: "Faktura.uz" }[doc.edoProvider] ?? doc.edoProvider) : null;

  return (
    <>
      <div className="mb-3">
        <Button variant="link" size="sm" asChild><Link href={doc.type === "report" ? "/documents?type=report" : "/documents"}><ArrowLeft /> Все документы</Link></Button>
      </div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{doc.title}<Badge tone={DOC_STATUS_TONE[doc.status as DocStatus]} dot>{DOC_STATUS_LABEL[doc.status as DocStatus]}</Badge>{(doc.status === "paid" || doc.status === "signed") && <span className="stamp text-accent text-xs">{doc.status === "paid" ? "ОПЛАЧЕНО" : "ПОДПИСАНО"}</span>}</span>}
        description={`${DOC_TYPE_LABEL_FULL[doc.type]} от ${fmtDate(doc.createdAt, { day: "numeric", month: "long", year: "numeric" })}${company ? ` · ${company.name}` : ""}`}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[12px] border border-line bg-surface-2">
            <iframe src={`/api/documents/${doc.id}/pdf#toolbar=1&view=FitH`} title={doc.title} className="block w-full bg-white" style={{ height: "80vh" }} />
          </div>
          {doc.type === "report" && payload.summary && (
            <Section title="Резюме для клиента" description={payload.period ? `Период: ${payload.period}${payload.aiSandbox ? " · текст сформирован без ИИ (демо-режим)" : " · текст подготовил ИИ"}` : undefined}>
              <p className="text-[15px] leading-relaxed max-w-[80ch]">{payload.summary}</p>
            </Section>
          )}
        </div>
        <div className="space-y-5">
          <Section title="Действия">
            <DocumentActionButtons doc={{ id: doc.id, type: doc.type, status: doc.status, edoStatus: doc.edoStatus, number: doc.number }} edoLive={edo.live} />
          </Section>
          <Section title="Реквизиты">
            <Row label="Тип"><Badge tone={DOC_TYPE_TONE[doc.type]}>{DOC_TYPE_LABEL[doc.type]}</Badge></Row>
            <Row label="Номер"><span className="font-medium">{doc.number}</span></Row>
            <Row label="Дата">{fmtDate(doc.createdAt, { day: "numeric", month: "long", year: "numeric" })}</Row>
            <Row label="Клиент">{company ? <Link href={`/companies/${company.id}`} className="hover:underline">{company.name}</Link> : "—"}</Row>
            {company?.inn && <Row label="ИНН"><span className="tnum">{company.inn}</span></Row>}
            <Row label="Сделка">{deal ? <Link href={`/deals/${deal.id}`} className="hover:underline">№{deal.number} · {deal.title}</Link> : "—"}</Row>
            <Row label="Сумма"><span className="tnum font-semibold text-[15px]">{fmtMoney(doc.amount)}</span></Row>
            <Row label="Статус"><Badge tone={DOC_STATUS_TONE[doc.status as DocStatus]} dot>{DOC_STATUS_LABEL[doc.status as DocStatus]}</Badge></Row>
            <Row label="Создал">{creator ? <span className="inline-flex items-center gap-1.5"><Avatar name={creator.name} color={creator.color} size={18} />{creator.name}</span> : "Система"}</Row>
            <Row label="Отправлен">{doc.sentAt ? fmtDateTime(doc.sentAt) : <span className="text-muted">ещё нет</span>}</Row>
          </Section>
          <Section title="ЭДО" description={edo.live ? `${edo.name} подключён` : `${edo.name} в демо-режиме`}>
            <Row label="Статус"><Badge tone={EDO_STATUS_TONE[doc.edoStatus as EdoStatus]} dot>{EDO_STATUS_LABEL[doc.edoStatus as EdoStatus]}</Badge></Row>
            <Row label="Провайдер">{edoProviderName ?? <span className="text-muted">—</span>}</Row>
            <Row label="ID в ЭДО">{doc.edoId ? <span className="font-mono text-xs">{doc.edoId}</span> : <span className="text-muted">—</span>}</Row>
          </Section>
          {payments.length > 0 && (
            <Section title="Оплаты">
              {payments.map((p) => (
                <Row key={p.id} label={fmtDate(p.paidAt, { day: "numeric", month: "short", year: "numeric" })}>
                  <span className="tnum font-medium text-good">+{fmtMoney(p.amount)}</span> <span className="text-muted text-xs">{{ sbp: "Payme/Click", bank: "банк", cash: "нал", card: "карта" }[p.method]}</span>
                </Row>
              ))}
            </Section>
          )}
          <Section title="История" description={`${activities.length} событий по документу`}>
            {activities.length === 0 ? (
              <EmptyState title="Пока пусто" description="Отправка, подписание и оплата появятся здесь." />
            ) : (
              <ol className="space-y-3">
                {activities.map(({ a, userName, userColor }) => {
                  const I = ACT_ICON[a.type] ?? FileText;
                  return (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"><I className="size-3.5" /></span>
                      <div className="min-w-0">
                        <div className="text-sm">{a.title}</div>
                        {a.body && <div className="text-[13px] text-ink-2 mt-0.5 line-clamp-3">{a.body}</div>}
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          {userName && <><Avatar name={userName} color={userColor ?? undefined} size={14} />{userName} ·</>}
                          <span title={fmtDateTime(a.createdAt)}>{relTime(a.createdAt)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
