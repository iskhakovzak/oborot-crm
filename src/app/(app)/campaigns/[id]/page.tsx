import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Megaphone } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CHANNEL_LABEL } from "@/lib/campaigns";
import { fmtDateTime, fmtPct, plural } from "@/lib/format";
import { PageHeader, EmptyState, Section, Stat } from "@/components/ui/page";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Segments } from "@/components/analytics/charts";
import { CHART } from "@/components/analytics/palette";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CAMPAIGN_STATUS, CHANNEL_TONE, campaignOptions, segmentSummary } from "@/components/campaigns/meta";

export const dynamic = "force-dynamic";

const DELIVERY: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "В очереди", tone: "neutral" },
  sent: { label: "Отправлено", tone: "info" },
  delivered: { label: "Доставлено", tone: "info" },
  opened: { label: "Открыто", tone: "good" },
  clicked: { label: "Переход", tone: "good" },
  failed: { label: "Ошибка", tone: "accent" },
};

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "campaigns", "view")) return <EmptyState icon={<Megaphone />} title="Нет доступа к рассылкам" />;
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, id) });
  if (!c) notFound();
  const deliveries = await db
    .select({ d: schema.campaignDeliveries, contactName: schema.contacts.name, companyName: schema.companies.name })
    .from(schema.campaignDeliveries)
    .leftJoin(schema.contacts, eq(schema.campaignDeliveries.contactId, schema.contacts.id))
    .leftJoin(schema.companies, eq(schema.campaignDeliveries.companyId, schema.companies.id))
    .where(eq(schema.campaignDeliveries.campaignId, id));
  const options = await campaignOptions();
  const managers = new Map(options.managers.map((m) => [m.id, m.name]));
  const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft;
  const s = c.stats;
  const canEdit = can(user.actor, "campaigns", "edit");
  const rate = (n: number) => (s.sent ? fmtPct((n / s.sent) * 100) : "—");

  return (
    <>
      <div className="mb-3"><Link href="/campaigns" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft className="size-3.5" /> Все рассылки</Link></div>
      <PageHeader eyebrow="Рост"
        title={<span className="flex flex-wrap items-center gap-2">{c.name} <Badge tone={CHANNEL_TONE[c.channel] ?? "neutral"}>{CHANNEL_LABEL[c.channel]}</Badge> <Badge tone={st.tone} dot>{st.label}</Badge></span>}
        description={`Сегмент: ${segmentSummary(c.segment ?? {}, managers)} · ${c.sentAt ? `отправлена ${fmtDateTime(c.sentAt)}` : `создана ${fmtDateTime(c.createdAt)}`}`}
        actions={
          <>
            {c.status === "draft" && canEdit && <Button asChild variant="secondary"><Link href={`/campaigns/${c.id}?edit=1`}>Изменить</Link></Button>}
            <CampaignActions id={c.id} status={c.status} canEdit={canEdit} canDelete={can(user.actor, "campaigns", "delete")} />
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Получателей" value={s.total} />
        <Stat label="Отправлено" value={s.sent} sub={s.failed ? `${s.failed} с ошибкой` : "без ошибок"} tone={s.failed ? "warn" : undefined} />
        <Stat label="Доставлено" value={s.delivered} sub={rate(s.delivered)} />
        <Stat label="Открыто" value={s.opened} sub={rate(s.opened)} tone="good" />
        <Stat label="Переходы" value={s.clicked} sub={rate(s.clicked)} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title="Воронка доставки" className="lg:col-span-1">
          {s.total ? (
            <>
              <Segments parts={[{ label: "Переход", value: s.clicked, color: CHART.good }, { label: "Открыто", value: s.opened - s.clicked, color: CHART.info }, { label: "Доставлено", value: s.delivered - s.opened, color: CHART.soft }, { label: "Ошибка", value: s.failed, color: CHART.accent }]} total={s.total} />
              <div className="mt-4 space-y-1.5 text-[13px]">
                {[["Отправлено", s.sent], ["Доставлено", s.delivered], ["Открыто", s.opened], ["Перешли по ссылке", s.clicked]].map(([k, v]) => (
                  <div key={String(k)} className="flex items-center justify-between"><span className="text-ink-2">{k}</span><span className="tnum">{v} <span className="text-muted">{rate(Number(v))}</span></span></div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-muted">Статистика появится после отправки.</p>
          )}
        </Section>
        <Section title="Текст рассылки" description={c.subject ? `Тема: ${c.subject}` : undefined} className="lg:col-span-2">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{c.body}</pre>
        </Section>
      </div>
      <Section title="Получатели" description={`${plural(deliveries.length, "доставка", "доставки", "доставок")}`} className="mt-5">
        {deliveries.length ? (
          <Table className="border-0 rounded-none">
            <thead><tr><th>Контакт</th><th>Компания</th><th>Адрес</th><th>Статус</th><th>Отправлено</th><th>Открыто</th><th>Переход</th></tr></thead>
            <tbody>
              {deliveries.map(({ d, contactName, companyName }) => {
                const ds = DELIVERY[d.status] ?? DELIVERY.queued;
                return (
                  <tr key={d.id}>
                    <td className="font-medium">{contactName ?? "—"}</td>
                    <td>{d.companyId ? <Link href={`/companies/${d.companyId}`} className="hover:underline">{companyName ?? "—"}</Link> : "—"}</td>
                    <td className="text-ink-2">{d.address}</td>
                    <td><Badge tone={ds.tone}>{ds.label}</Badge>{d.error && <div className="text-xs text-accent">{d.error}</div>}</td>
                    <td className="whitespace-nowrap text-ink-2">{fmtDateTime(d.sentAt)}</td>
                    <td className="whitespace-nowrap text-ink-2">{fmtDateTime(d.openedAt)}</td>
                    <td className="whitespace-nowrap text-ink-2">{fmtDateTime(d.clickedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="text-[13px] text-muted">Список получателей сформируется при отправке по текущему сегменту.</p>
        )}
      </Section>
      {c.status === "draft" && canEdit && <CampaignForm open={sp.edit === "1"} options={options} closeHref={`/campaigns/${c.id}`} initial={{ id: c.id, name: c.name, channel: c.channel, subject: c.subject ?? "", body: c.body, segment: c.segment ?? {} }} />}
    </>
  );
}
