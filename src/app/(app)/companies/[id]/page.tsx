import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, MessagesSquare, PhoneCall, PhoneIncoming, PhoneOutgoing, Bot, ExternalLink, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, canRecord, hiddenFields, readonlyFields } from "@/lib/permissions";
import { fmtMoney, fmtDate, fmtDateTime, phoneFmt, plural } from "@/lib/format";
import { EmptyState, Section } from "@/components/ui/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyHeader } from "@/components/companies/company-header";
import { CompanyContacts } from "@/components/companies/company-contacts";
import { ActivityFeed } from "@/components/deals/activity-feed";
import { NoteForm } from "@/components/deals/note-form";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import type { PipelineInfo } from "@/components/deals/types";
import { addCompanyNote } from "../actions";

export const dynamic = "force-dynamic";

const CHANNEL: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", instagram: "Instagram", max: "MAX", email: "Email", sms: "SMS", web: "Сайт" };
const CALL_STATUS: Record<string, string> = { queued: "в очереди", ringing: "идёт вызов", answered: "ответили", missed: "пропущен", busy: "занято", completed: "завершён", ai_handled: "принял ИИ" };
const DOC_STATUS: Record<string, [string, Tone]> = { draft: ["Черновик", "neutral"], sent: ["Отправлен", "info"], signed: ["Подписан", "good"], paid: ["Оплачен", "good"], cancelled: ["Отменён", "accent"] };
const EDO: Record<string, string> = { queued: "ЭДО: в очереди", sent: "ЭДО: отправлен", delivered: "ЭДО: доставлен", signed: "ЭДО: подписан", rejected: "ЭДО: отклонён" };
const METHOD: Record<string, string> = { sbp: "Payme/Click", bank: "Банк", cash: "Наличные", card: "Карта" };

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user.actor, "companies", "view")) return <EmptyState title="Нет доступа к клиентам" />;
  const row = await db.select({ c: schema.companies, managerName: schema.users.name, managerColor: schema.users.color, managerTeamId: schema.users.teamId }).from(schema.companies).leftJoin(schema.users, eq(schema.companies.managerId, schema.users.id)).where(eq(schema.companies.id, id)).then((r) => r[0]);
  if (!row) notFound();
  const { c } = row;
  const owner = { ownerId: c.managerId, ownerTeamId: row.managerTeamId };
  if (!canRecord(user.actor, "companies", "view", owner)) return <EmptyState title="Нет доступа к этому клиенту" action={<Link href="/companies" className="text-info hover:underline">К списку клиентов</Link>} />;
  const canEdit = can(user.actor, "companies", "edit") && canRecord(user.actor, "companies", "edit", owner);
  const hidden = hiddenFields(user.actor, "companies");
  const readonly = readonlyFields(user.actor, "companies");
  const contactsHidden = hiddenFields(user.actor, "contacts");
  const dealsHidden = hiddenFields(user.actor, "deals");

  const [contacts, users, pipelinesRaw, stagesRaw, deals, documents, payments, conversations, calls, activities] = await Promise.all([
    db.query.contacts.findMany({ where: eq(schema.contacts.companyId, id), orderBy: [desc(schema.contacts.isPrimary), asc(schema.contacts.name)] }),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name)),
    db.query.pipelines.findMany({ orderBy: asc(schema.pipelines.order) }),
    db.query.stages.findMany({ orderBy: asc(schema.stages.order) }),
    can(user.actor, "deals", "view") ? db.select({ d: schema.deals, managerTeamId: schema.users.teamId }).from(schema.deals).leftJoin(schema.users, eq(schema.deals.managerId, schema.users.id)).where(eq(schema.deals.companyId, id)).orderBy(desc(schema.deals.updatedAt)) : [],
    can(user.actor, "documents", "view") ? db.query.documents.findMany({ where: eq(schema.documents.companyId, id), orderBy: desc(schema.documents.createdAt), limit: 30 }) : [],
    can(user.actor, "payments", "view") ? db.query.payments.findMany({ where: eq(schema.payments.companyId, id), orderBy: desc(schema.payments.paidAt), limit: 30 }) : [],
    can(user.actor, "conversations", "view") ? db.query.conversations.findMany({ where: eq(schema.conversations.companyId, id), orderBy: desc(schema.conversations.lastMessageAt), limit: 8 }) : [],
    can(user.actor, "calls", "view") ? db.query.calls.findMany({ where: eq(schema.calls.companyId, id), orderBy: desc(schema.calls.startedAt), limit: 8 }) : [],
    db.select({ a: schema.activities, userName: schema.users.name, userColor: schema.users.color }).from(schema.activities).leftJoin(schema.users, eq(schema.activities.userId, schema.users.id)).where(eq(schema.activities.companyId, id)).orderBy(desc(schema.activities.createdAt)).limit(60),
  ]);
  const pipelines: PipelineInfo[] = pipelinesRaw.map((p) => ({ id: p.id, name: p.name, kind: p.kind, stages: stagesRaw.filter((s) => s.pipelineId === p.id) }));
  const stageById = new Map(stagesRaw.map((s) => [s.id, s]));
  const visibleDeals = deals.filter((r) => canRecord(user.actor, "deals", "view", { ownerId: r.d.managerId, ownerTeamId: r.managerTeamId })).map((r) => r.d);
  const salesPipeline = pipelines.find((p) => p.kind === "sales") ?? pipelines[0];
  const wonSum = visibleDeals.filter((d) => d.status === "won").reduce((s, d) => s + d.amount, 0);
  const paidIn = payments.filter((p) => p.direction === "in").reduce((s, p) => s + p.amount, 0);
  const s = (v: string | null) => v ?? "";

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted">
        <Link href="/companies" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="size-3.5" /> Клиенты</Link>
      </div>
      <CompanyHeader
        company={{ id: c.id, name: c.name, shortName: s(c.shortName), inn: s(c.inn), oked: s(c.oked), regNumber: s(c.regNumber), legalAddress: s(c.legalAddress), address: s(c.address), director: s(c.director), directorPosition: s(c.directorPosition), bankName: hidden.includes("bankName") ? "" : s(c.bankName), mfo: s(c.mfo), account: hidden.includes("account") ? "" : s(c.account), email: s(c.email), phone: s(c.phone), website: s(c.website), industry: s(c.industry), status: c.status, source: s(c.source), managerId: s(c.managerId), tags: (c.tags ?? []).join(", "), notes: hidden.includes("notes") ? "" : s(c.notes), balance: hidden.includes("balance") ? 0 : c.balance, tagsList: c.tags ?? [], managerName: row.managerName, managerColor: row.managerColor, createdAt: c.createdAt }}
        users={users}
        hidden={hidden}
        readonly={readonly}
        canEdit={canEdit}
        canReport={can(user.actor, "documents", "create")}
        hasPhone={!!(c.phone || contacts.some((x) => x.phone))}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <CompanyContacts companyId={c.id} contacts={contacts} canCreate={can(user.actor, "contacts", "create")} canEdit={can(user.actor, "contacts", "edit")} canDelete={can(user.actor, "contacts", "delete")} hidden={contactsHidden} />

          {can(user.actor, "deals", "view") && (
            <Section
              title="Сделки"
              description={visibleDeals.length ? `${plural(visibleDeals.length, "сделка", "сделки", "сделок")}${!dealsHidden.includes("amount") && wonSum ? ` · выиграно на ${fmtMoney(wonSum)}` : ""}` : undefined}
              action={can(user.actor, "deals", "create") && salesPipeline && <NewDealDialog pipelines={pipelines} companies={[{ id: c.id, name: c.name }]} users={users} defaultPipelineId={salesPipeline.id} defaultCompanyId={c.id} label="Сделка" size="sm" />}
            >
              {!visibleDeals.length ? (
                <p className="text-[13px] text-muted">Сделок с этим клиентом ещё нет.</p>
              ) : (
                <div className="space-y-4">
                  {pipelines.filter((p) => visibleDeals.some((d) => d.pipelineId === p.id)).map((p) => (
                    <div key={p.id}>
                      <div className="mb-1.5 text-[12px] font-medium text-muted">{p.name}</div>
                      <ul className="divide-y divide-line rounded-[10px] border border-line">
                        {visibleDeals.filter((d) => d.pipelineId === p.id).map((d) => {
                          const st = stageById.get(d.stageId);
                          return (
                            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                              <span className="w-12 shrink-0 text-[12px] text-muted tnum">№{d.number}</span>
                              <Link href={`/deals/${d.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{d.title}</Link>
                              <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-2"><span className="size-2 rounded-full" style={{ background: st?.color }} />{st?.name}</span>
                              {!dealsHidden.includes("amount") && <span className="w-28 shrink-0 text-right text-[13px] font-medium tnum">{fmtMoney(d.amount)}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {can(user.actor, "documents", "view") && (
            <Section title="Документы" description={documents.length ? plural(documents.length, "документ", "документа", "документов") : undefined} action={<Button size="sm" variant="ghost" asChild><Link href="/documents">Все документы</Link></Button>}>
              {!documents.length ? (
                <p className="text-[13px] text-muted">Документов нет. Счета и договоры формируются из карточки сделки.</p>
              ) : (
                <ul className="divide-y divide-line -my-2">
                  {documents.map((d) => {
                    const [sl, st] = DOC_STATUS[d.status] ?? ["—", "neutral"];
                    return (
                      <li key={d.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{d.title}</span>
                            <Badge tone={st}>{sl}</Badge>
                            {d.edoStatus !== "none" && <Badge tone={d.edoStatus === "signed" ? "good" : d.edoStatus === "rejected" ? "accent" : "info"}>{EDO[d.edoStatus]}</Badge>}
                          </div>
                          <div className="text-xs text-muted tnum">{fmtMoney(d.amount)} · {fmtDate(d.createdAt)}{d.dealId ? <> · <Link href={`/deals/${d.dealId}`} className="hover:underline">сделка</Link></> : null}</div>
                        </div>
                        <Button size="sm" variant="ghost" asChild><a href={`/api/documents/${d.id}/pdf`} target="_blank" rel="noreferrer"><ExternalLink /> PDF</a></Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          {can(user.actor, "payments", "view") && (
            <Section title="Оплаты" description={payments.length ? `поступило ${fmtMoney(paidIn)}` : undefined} action={<Button size="sm" variant="ghost" asChild><Link href="/finance">Финансы</Link></Button>}>
              {!payments.length ? (
                <p className="text-[13px] text-muted">Оплат ещё не было.</p>
              ) : (
                <table className="table-base w-full text-sm -my-2">
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="pl-0 text-muted tnum whitespace-nowrap">{fmtDate(p.paidAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td>{p.purpose ?? (p.direction === "in" ? "Оплата" : "Возврат")}</td>
                        <td className="text-muted">{METHOD[p.method] ?? p.method}</td>
                        <td className={`pr-0 text-right tnum font-medium ${p.direction === "in" ? "text-good" : "text-accent"}`}>{p.direction === "in" ? "+" : "−"}{fmtMoney(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-4">
          {(can(user.actor, "conversations", "view") || can(user.actor, "calls", "view")) && (
            <Section title="Переписки и звонки" className="[&>div:last-child]:p-4">
              {!conversations.length && !calls.length ? (
                <p className="text-[13px] text-muted">Контактов с клиентом ещё не было.</p>
              ) : (
                <ul className="space-y-1">
                  {conversations.map((cv) => (
                    <li key={cv.id}>
                      <Link href={`/inbox?c=${cv.id}`} className="flex items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-surface-2">
                        <MessagesSquare className="size-4 shrink-0 text-info" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{cv.peerName} <span className="text-muted">· {CHANNEL[cv.channel] ?? cv.channel}</span></span>
                          <span className="block text-[11.5px] text-muted">{fmtDateTime(cv.lastMessageAt)}{cv.aiEnabled ? " · отвечает ИИ" : ""}</span>
                        </span>
                        {cv.unread > 0 && <Badge tone="accent">{cv.unread}</Badge>}
                      </Link>
                    </li>
                  ))}
                  {calls.map((cl) => (
                    <li key={cl.id}>
                      <Link href="/calls" className="flex items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-surface-2">
                        {cl.aiHandled ? <Bot className="size-4 shrink-0 text-violet" /> : cl.status === "missed" ? <PhoneCall className="size-4 shrink-0 text-accent" /> : cl.direction === "in" ? <PhoneIncoming className="size-4 shrink-0 text-good" /> : <PhoneOutgoing className="size-4 shrink-0 text-ink-2" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{cl.direction === "in" ? "Входящий" : "Исходящий"} {phoneFmt(cl.phone)} <span className="text-muted">· {CALL_STATUS[cl.status] ?? cl.status}</span></span>
                          <span className="block text-[11.5px] text-muted">{fmtDateTime(cl.startedAt)}{cl.durationSec ? ` · ${Math.round(cl.durationSec / 60)} мин` : ""}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
          <Section title="История" description={activities.length ? plural(activities.length, "событие", "события", "событий") : undefined} className="[&>div:last-child]:p-4">
            <NoteForm action={addCompanyNote.bind(null, c.id)} placeholder="Заметка по клиенту…" />
            <ActivityFeed items={activities.map(({ a, userName, userColor }) => ({ id: a.id, type: a.type, title: a.title, body: a.body, createdAt: a.createdAt, userName, userColor }))} />
          </Section>
          {can(user.actor, "deals", "create") && salesPipeline && !visibleDeals.length && (
            <div className="rounded-[12px] border border-dashed border-line-strong p-4 text-center text-[13px] text-muted">
              <Plus className="mx-auto mb-1 size-5" />
              Создайте первую сделку с этим клиентом — кнопка «Сделка» в блоке сделок.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
