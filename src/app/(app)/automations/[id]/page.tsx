import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDateTime, relTime } from "@/lib/format";
import { PageHeader, EmptyState, Section } from "@/components/ui/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { ACTION_LABELS, EVENT_LABELS } from "@/lib/automations/engine";
import { actionSummary, describeCondition } from "@/components/automations/types";

export const dynamic = "force-dynamic";

const STATUS: Record<"ok" | "error" | "skipped", { label: string; tone: Tone }> = { ok: { label: "выполнено", tone: "good" }, error: { label: "ошибка", tone: "accent" }, skipped: { label: "пропущено", tone: "neutral" } };

export default async function AutomationRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user.actor, "automations", "view")) {
    return (
      <>
        <PageHeader title="Автоматизации" />
        <EmptyState title="Нет доступа" description="Раздел доступен администратору." />
      </>
    );
  }
  const rule = await db.query.automations.findFirst({ where: eq(schema.automations.id, id) });
  if (!rule) notFound();
  const runs = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.automationId, id)).orderBy(desc(schema.automationRuns.createdAt)).limit(200);
  const okCount = runs.filter((r) => r.status === "ok").length;
  const errCount = runs.filter((r) => r.status === "error").length;

  return (
    <>
      <Link href="/automations" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Все автоматизации</Link>
      <PageHeader
        title={rule.name}
        description={rule.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={rule.isActive ? "good" : "neutral"} dot>{rule.isActive ? "включена" : "выключена"}</Badge>
            <Button variant="secondary" asChild><Link href="/automations">К списку</Link></Button>
          </div>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-muted">Когда</span>
          <Badge tone="ink">{EVENT_LABELS[rule.event]}</Badge>
          {(rule.conditions ?? []).length > 0 && <span className="text-muted">если</span>}
          {(rule.conditions ?? []).map((c, i) => (
            <Badge key={i} tone="warn">{describeCondition(c)}</Badge>
          ))}
          <span className="text-muted">→</span>
          {rule.actions.map((a, i) => {
            const s = actionSummary(a);
            return (
              <Badge key={i} tone="info">{ACTION_LABELS[a.type]}{s && <span className="font-normal opacity-75">· {s}</span>}</Badge>
            );
          })}
        </div>
      </PageHeader>

      <Section title="Журнал запусков" description={`${rule.runsCount} успешных запусков · последний ${rule.lastRunAt ? relTime(rule.lastRunAt) : "—"}`} action={<div className="text-xs text-muted">показано {runs.length} · ок {okCount} · ошибок {errCount}</div>} className="[&>div:last-child]:p-0">
        {runs.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">Запусков ещё не было. Нажмите «Проверить» в списке автоматизаций или дождитесь события «{EVENT_LABELS[rule.event]}».</p>
        ) : (
          <Table className="rounded-none border-0">
            <thead>
              <tr>
                <th className="w-[160px]">Время</th>
                <th className="w-[200px]">Событие</th>
                <th className="w-[120px]">Статус</th>
                <th>Лог</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="align-top text-muted tnum" title={r.createdAt}>{fmtDateTime(r.createdAt)}</td>
                  <td className="align-top">
                    <div>{EVENT_LABELS[r.event as keyof typeof EVENT_LABELS] ?? r.event}</div>
                    {r.entityId && (
                      <Link href={r.entityId.startsWith("deal_") ? `/deals/${r.entityId}` : r.entityId.startsWith("cmp_") ? `/companies/${r.entityId}` : "#"} className="text-xs text-muted hover:text-ink">{r.entityId}</Link>
                    )}
                  </td>
                  <td className="align-top"><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
                  <td className="align-top">
                    <ol className="space-y-0.5 text-[13px]">
                      {r.log.map((l, i) => (
                        <li key={i} className="flex gap-2"><span className="w-4 shrink-0 text-muted tnum">{i + 1}.</span><span className={l.startsWith("Ошибка") ? "text-accent" : ""}>{l}</span></li>
                      ))}
                    </ol>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
