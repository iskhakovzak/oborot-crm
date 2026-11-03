import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { ArrowLeft, MessagesSquare, PhoneCall, PhoneIncoming, PhoneOutgoing, Bot } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, canRecord, hiddenFields, readonlyFields } from "@/lib/permissions";
import { fmtDateTime, phoneFmt, plural } from "@/lib/format";
import { EmptyState, Section } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { DealHeader } from "@/components/deals/deal-header";
import { DealItems } from "@/components/deals/deal-items";
import { DealDocuments } from "@/components/deals/deal-documents";
import { DealHandoff, type RelatedDeal } from "@/components/deals/deal-handoff";
import { DealTasks } from "@/components/deals/deal-tasks";
import { ActivityFeed } from "@/components/deals/activity-feed";
import { NoteForm } from "@/components/deals/note-form";
import { addDealNote } from "../actions";

export const dynamic = "force-dynamic";

const CHANNEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", max: "MAX", email: "Email", sms: "SMS", web: "Сайт" };
const CALL_STATUS: Record<string, string> = { queued: "в очереди", ringing: "идёт вызов", answered: "ответили", missed: "пропущен", busy: "занято", completed: "завершён", ai_handled: "принял ИИ" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user.actor, "deals", "view")) return <EmptyState title="Нет доступа к сделкам" />;
  const row = await db.select({ deal: schema.deals, ownerTeamId: schema.users.teamId, managerName: schema.users.name, managerColor: schema.users.color }).from(schema.deals).leftJoin(schema.users, eq(schema.deals.managerId, schema.users.id)).where(eq(schema.deals.id, id)).then((r) => r[0]);
  if (!row) notFound();
  const { deal } = row;
  const owner = { ownerId: deal.managerId, ownerTeamId: row.ownerTeamId };
  if (!canRecord(user.actor, "deals", "view", owner)) return <EmptyState title="Нет доступа к этой сделке" description="Сделка принадлежит другому менеджеру или команде." action={<Link href="/deals" className="text-info hover:underline">К списку сделок</Link>} />;
  const canEdit = can(user.actor, "deals", "edit") && canRecord(user.actor, "deals", "edit", owner);
  const hidden = hiddenFields(user.actor, "deals");
  const readonly = readonlyFields(user.actor, "deals");

  const [pipeline, stages, company, contacts, users, items, products, documents, links, activities, tasks, conversations, calls, parent, children, orders] = await Promise.all([
    db.query.pipelines.findFirst({ where: eq(schema.pipelines.id, deal.pipelineId) }),
    db.query.stages.findMany({ where: eq(schema.stages.pipelineId, deal.pipelineId), orderBy: asc(schema.stages.order) }),
    deal.companyId ? db.query.companies.findFirst({ where: eq(schema.companies.id, deal.companyId) }) : null,
    deal.companyId ? db.query.contacts.findMany({ where: eq(schema.contacts.companyId, deal.companyId), orderBy: [desc(schema.contacts.isPrimary), asc(schema.contacts.name)] }) : [],
    db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name)),
    db.query.dealItems.findMany({ where: eq(schema.dealItems.dealId, id) }),
    can(user.actor, "products", "view") ? db.select({ id: schema.products.id, name: schema.products.name, sku: schema.products.sku, barcode: schema.products.barcode, price: schema.products.price, unit: schema.products.unit, vatRate: schema.products.vatRate, category: schema.products.category }).from(schema.products).where(eq(schema.products.isActive, true)).orderBy(asc(schema.products.name)) : [],
    can(user.actor, "documents", "view") ? db.query.documents.findMany({ where: eq(schema.documents.dealId, id), orderBy: desc(schema.documents.createdAt) }) : [],
    db.query.paymentLinks.findMany({ where: eq(schema.paymentLinks.dealId, id), orderBy: desc(schema.paymentLinks.createdAt) }),
    db.select({ a: schema.activities, userName: schema.users.name, userColor: schema.users.color }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.userId, schema.users.id)).where(eq(schema.activities.dealId, id)).orderBy(desc(schema.activities.createdAt)).limit(60),
    db.select({ t: schema.tasks, assigneeName: schema.users.name }).from(schema.tasks).leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id)).where(eq(schema.tasks.dealId, id)).orderBy(asc(schema.tasks.status), asc(schema.tasks.dueAt)),
    can(user.actor, "conversations", "view") ? db.query.conversations.findMany({ where: deal.companyId ? or(eq(schema.conversations.dealId, id), eq(schema.conversations.companyId, deal.companyId)) : eq(schema.conversations.dealId, id), orderBy: desc(schema.conversations.lastMessageAt), limit: 8 }) : [],
    can(user.actor, "calls", "view") ? db.query.calls.findMany({ where: deal.companyId ? or(eq(schema.calls.dealId, id), eq(schema.calls.companyId, deal.companyId)) : eq(schema.calls.dealId, id), orderBy: desc(schema.calls.startedAt), limit: 8 }) : [],
    deal.parentDealId ? db.query.deals.findFirst({ where: eq(schema.deals.id, deal.parentDealId) }) : null,
    db.query.deals.findMany({ where: eq(schema.deals.parentDealId, id) }),
    db.query.productionOrders.findMany({ where: eq(schema.productionOrders.dealId, id), orderBy: desc(schema.productionOrders.createdAt) }),
  ]);
  if (!pipeline) notFound();

  const relatedRaw = [...(parent ? [{ d: parent, relation: "parent" as const }] : []), ...children.map((d) => ({ d, relation: "child" as const }))];
  const relStageIds = relatedRaw.map((r) => r.d.stageId);
  const relStages = relStageIds.length ? await db.select({ s: schema.stages, pipelineName: schema.pipelines.name }).from(schema.stages).innerJoin(schema.pipelines, eq(schema.stages.pipelineId, schema.pipelines.id)).where(inArray(schema.stages.id, relStageIds)) : [];
  const orderStages = orders.length ? await db.query.stages.findMany({ where: inArray(schema.stages.id, orders.map((o) => o.stageId).filter((x): x is string => !!x)) }) : [];
  const related: RelatedDeal[] = relatedRaw.map(({ d, relation }) => {
    const st = relStages.find((x) => x.s.id === d.stageId);
    return { id: d.id, number: d.number, title: d.title, amount: hidden.includes("amount") ? null : d.amount, pipelineName: st?.pipelineName ?? "", stageName: st?.s.name ?? "", stageColor: st?.s.color ?? "#ccc", status: d.status, relation };
  });

  const contactRows = contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
  const contact = contacts.find((c) => c.id === deal.contactId);
  const hasPhone = !!(contact?.phone ?? company?.phone ?? contacts[0]?.phone);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Link href={`/deals?pipeline=${pipeline.id}`} className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="size-3.5" /> Сделки · {pipeline.name}</Link>
      </div>
      <DealHeader
        deal={{ id: deal.id, number: deal.number, title: deal.title, amount: deal.amount, status: deal.status, stageId: deal.stageId, managerId: deal.managerId, contactId: deal.contactId, companyId: deal.companyId, source: deal.source, utm: deal.utm ?? null, ymClientId: deal.ymClientId, nextStep: deal.nextStep, expectedCloseAt: deal.expectedCloseAt, lostReason: deal.lostReason, createdAt: deal.createdAt, stageEnteredAt: deal.stageEnteredAt, closedAt: deal.closedAt }}
        company={company ? { id: company.id, name: company.name } : null}
        contacts={contactRows}
        users={users}
        stages={stages}
        pipelineName={pipeline.name}
        canEdit={canEdit}
        hidden={hidden}
        readonly={readonly}
        manager={row.managerName ? { name: row.managerName, color: row.managerColor ?? "#4b5260" } : null}
        hasPhone={hasPhone}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <DealItems dealId={deal.id} items={items} products={products} canEdit={canEdit} />
          <DealDocuments dealId={deal.id} documents={documents.map((d) => ({ id: d.id, type: d.type, number: d.number, title: d.title, amount: d.amount, status: d.status, edoStatus: d.edoStatus, sentAt: d.sentAt, createdAt: d.createdAt }))} links={links.map((l) => ({ id: l.id, amount: l.amount, url: l.url, status: l.status, createdAt: l.createdAt, documentId: l.documentId }))} canCreate={can(user.actor, "documents", "create")} canSend={can(user.actor, "documents", "view")} />
          <DealHandoff dealId={deal.id} pipelineKind={pipeline.kind} related={related} orders={orders.map((o) => ({ id: o.id, number: o.number, title: o.title, status: o.status, stageName: orderStages.find((s) => s.id === o.stageId)?.name ?? null }))} canHandoff={canEdit} />
        </div>
        <div className="space-y-4">
          <DealTasks dealId={deal.id} tasks={tasks.map(({ t, assigneeName }) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority, assigneeName }))} canCreate={can(user.actor, "tasks", "create")} />
          {(can(user.actor, "conversations", "view") || can(user.actor, "calls", "view")) && (
            <Section title="Переписки и звонки" className="[&>div:last-child]:p-4">
              {!conversations.length && !calls.length ? (
                <p className="text-[13px] text-muted">Контактов с клиентом по этой сделке ещё не было.</p>
              ) : (
                <ul className="space-y-1">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-surface-2">
                        <MessagesSquare className="size-4 shrink-0 text-info" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{c.peerName} <span className="text-muted">· {CHANNEL[c.channel] ?? c.channel}</span></span>
                          <span className="block text-[11.5px] text-muted">{fmtDateTime(c.lastMessageAt)}{c.aiEnabled ? " · отвечает ИИ" : ""}</span>
                        </span>
                        {c.unread > 0 && <Badge tone="accent">{c.unread}</Badge>}
                      </Link>
                    </li>
                  ))}
                  {calls.map((c) => (
                    <li key={c.id}>
                      <Link href="/calls" className="flex items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-surface-2">
                        {c.aiHandled ? <Bot className="size-4 shrink-0 text-violet" /> : c.status === "missed" ? <PhoneCall className="size-4 shrink-0 text-accent" /> : c.direction === "in" ? <PhoneIncoming className="size-4 shrink-0 text-good" /> : <PhoneOutgoing className="size-4 shrink-0 text-ink-2" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{c.direction === "in" ? "Входящий" : "Исходящий"} {phoneFmt(c.phone)} <span className="text-muted">· {CALL_STATUS[c.status] ?? c.status}</span></span>
                          <span className="block text-[11.5px] text-muted">{fmtDateTime(c.startedAt)}{c.durationSec ? ` · ${Math.round(c.durationSec / 60)} мин` : ""}{c.aiSummary ? ` · ${c.aiSummary}` : ""}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
          <Section title="История" description={activities.length ? plural(activities.length, "событие", "события", "событий") : undefined} className="[&>div:last-child]:p-4">
            <NoteForm action={addDealNote.bind(null, deal.id)} />
            <ActivityFeed items={activities.map(({ a, userName, userColor }) => ({ id: a.id, type: a.type, title: a.title, body: a.body, createdAt: a.createdAt, userName, userColor }))} />
          </Section>
        </div>
      </div>
    </div>
  );
}
