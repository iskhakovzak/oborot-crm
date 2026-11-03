import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, scopeOf } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { resolve } from "@/lib/integrations/registry";
import { PageHeader, EmptyState, Stat } from "@/components/ui/page";
import { CallsView, type CallItem } from "@/components/calls/calls-view";
import { PhoneCall } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Звонки" };

export default async function CallsPage() {
  const user = await requireUser();
  if (!can(user.actor, "calls", "view")) return <EmptyState icon={<PhoneCall />} title="Нет доступа к звонкам" description="Обратитесь к администратору, чтобы открыть раздел для вашей роли." />;
  const scope = scopeOf(user.actor, "calls", "view");
  const rows = await db
    .select({ c: schema.calls, contact: { id: schema.contacts.id, name: schema.contacts.name }, company: { id: schema.companies.id, name: schema.companies.name }, user: { id: schema.users.id, name: schema.users.name, color: schema.users.color }, deal: { id: schema.deals.id, title: schema.deals.title } })
    .from(schema.calls)
    .leftJoin(schema.contacts, eq(schema.calls.contactId, schema.contacts.id))
    .leftJoin(schema.companies, eq(schema.calls.companyId, schema.companies.id))
    .leftJoin(schema.users, eq(schema.calls.userId, schema.users.id))
    .leftJoin(schema.deals, eq(schema.calls.dealId, schema.deals.id))
    .where(scope === "own" ? eq(schema.calls.userId, user.id) : undefined)
    .orderBy(desc(schema.calls.startedAt))
    .limit(300);
  const calls: CallItem[] = rows.map((r) => ({
    id: r.c.id, direction: r.c.direction, phone: r.c.phone, status: r.c.status, durationSec: r.c.durationSec, startedAt: r.c.startedAt, aiHandled: r.c.aiHandled, transcript: r.c.transcript, aiSummary: r.c.aiSummary, recordingUrl: r.c.recordingUrl, provider: r.c.provider,
    contactId: r.contact?.id ?? null, contactName: r.contact?.name ?? null, companyId: r.company?.id ?? null, companyName: r.company?.name ?? null, userName: r.user?.name ?? null, userColor: r.user?.color ?? null, dealId: r.deal?.id ?? null, dealTitle: r.deal?.title ?? null,
  }));

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart); weekStart.setDate(weekStart.getDate() - 6);
  const stat = (since: Date, f: (c: CallItem) => boolean) => calls.filter((c) => new Date(c.startedAt) >= since && f(c)).length;
  const cards = [
    { label: "Входящие", f: (c: CallItem) => c.direction === "in" && c.status !== "missed", tone: undefined },
    { label: "Исходящие", f: (c: CallItem) => c.direction === "out", tone: undefined },
    { label: "Пропущенные", f: (c: CallItem) => c.status === "missed", tone: "accent" as const },
    { label: "Принял ИИ", f: (c: CallItem) => c.aiHandled, tone: "info" as const },
  ];

  const contacts = (await db.select({ id: schema.contacts.id, name: schema.contacts.name, phone: schema.contacts.phone, company: schema.companies.name }).from(schema.contacts).leftJoin(schema.companies, eq(schema.contacts.companyId, schema.companies.id)).orderBy(asc(schema.contacts.name))).filter((c) => c.phone);
  const ai = await getSetting("ai");
  const tel = await resolve("telephony");

  return (
    <>
      <PageHeader title="Звонки" description={`Телефония: ${tel.name}${tel.live ? "" : " (демо-режим)"} · ИИ на входящих ${ai.callsEnabled ? "включён" : "выключен"}.`} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((s) => (
          <Stat key={s.label} label={s.label} value={stat(dayStart, s.f)} tone={stat(dayStart, s.f) > 0 ? s.tone : undefined} sub={`сегодня · за 7 дней: ${stat(weekStart, s.f)}`} />
        ))}
      </div>
      <CallsView calls={calls} contacts={contacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone!, company: c.company }))} canCreate={can(user.actor, "calls", "create")} canEdit={can(user.actor, "calls", "edit")} aiCallsEnabled={ai.callsEnabled} assistantName={ai.assistantName} />
    </>
  );
}
