import { Suspense } from "react";
import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { relTime } from "@/lib/format";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Tiles, Tile } from "@/components/dashboard/widgets";
import { AutomationList } from "@/components/automations/automation-list";
import { ACTION_LABELS, EVENT_LABELS } from "@/lib/automations/engine";
import { TEMPLATE_VARS } from "@/lib/automations/templates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Автоматизации" };

export default async function AutomationsPage() {
  const user = await requireUser();
  if (!can(user.actor, "automations", "view")) {
    return (
      <>
        <PageHeader eyebrow="Система" title="Автоматизации" />
        <EmptyState title="Нет доступа" description="Раздел доступен администратору. Попросите открыть «Автоматизации» для вашей роли." />
      </>
    );
  }
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [rules, users, salesPipeline, deals, [{ runs24 }], [{ errors24 }]] = await Promise.all([
    db.select().from(schema.automations).orderBy(desc(schema.automations.isActive), asc(schema.automations.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name)),
    db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, "sales") }),
    db.select({ id: schema.deals.id, title: schema.deals.title, number: schema.deals.number, company: schema.companies.name }).from(schema.deals).leftJoin(schema.companies, eq(schema.deals.companyId, schema.companies.id)).where(eq(schema.deals.status, "open")).orderBy(desc(schema.deals.updatedAt)).limit(100),
    db.select({ runs24: count() }).from(schema.automationRuns).where(gte(schema.automationRuns.createdAt, dayAgo)),
    db.select({ errors24: count() }).from(schema.automationRuns).where(and(gte(schema.automationRuns.createdAt, dayAgo), eq(schema.automationRuns.status, "error"))),
  ]);
  const stages = salesPipeline ? (await db.select({ name: schema.stages.name }).from(schema.stages).where(eq(schema.stages.pipelineId, salesPipeline.id)).orderBy(asc(schema.stages.order))).map((s) => s.name) : [];
  const active = rules.filter((r) => r.isActive).length;
  const totalRuns = rules.reduce((s, r) => s + r.runsCount, 0);

  return (
    <>
      <PageHeader eyebrow="Система"
        title="Автоматизации"
        description="Правила «событие → действие»: сообщение клиенту, задача, счёт, передача в отгрузку, конверсии."
        actions={can(user.actor, "automations", "create") ? <Button asChild><Link href="/automations?new=1"><Plus /> Новая автоматизация</Link></Button> : undefined}
      />
      <Tiles cols={4}>
        <Tile label="Правил включено" value={active} sub={`из ${rules.length}`} />
        <Tile label="Запусков всего" value={totalRuns} sub="с момента создания" />
        <Tile label="За 24 часа" value={runs24} sub="запусков" tone={runs24 ? "info" : undefined} />
        <Tile label="Ошибок за 24 часа" value={errors24} sub={errors24 ? "смотрите журнал" : "всё чисто"} tone={errors24 ? "accent" : "good"} />
      </Tiles>
      <Suspense>
        <AutomationList
          rules={rules.map((r) => ({ id: r.id, name: r.name, description: r.description, event: r.event, conditions: r.conditions ?? [], actions: r.actions ?? [], isActive: r.isActive, runsCount: r.runsCount, lastRunAt: r.lastRunAt, lastRunLabel: relTime(r.lastRunAt) }))}
          users={users}
          stages={stages}
          labels={{ events: EVENT_LABELS, actions: ACTION_LABELS, vars: TEMPLATE_VARS }}
          deals={deals.map((d) => ({ id: d.id, name: `№${d.number} · ${d.title}${d.company ? ` — ${d.company}` : ""}` }))}
          canEdit={can(user.actor, "automations", "edit")}
          canCreate={can(user.actor, "automations", "create")}
          canDelete={can(user.actor, "automations", "delete")}
        />
      </Suspense>
    </>
  );
}
