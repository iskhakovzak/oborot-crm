import Link from "next/link";
import { desc } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CHANNEL_LABEL } from "@/lib/campaigns";
import { fmtDateTime, fmtPct, plural } from "@/lib/format";
import { PageHeader, EmptyState, Stat } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CAMPAIGN_STATUS, CHANNEL_TONE, campaignOptions, segmentSummary } from "@/components/campaigns/meta";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!can(user.actor, "campaigns", "view")) return <EmptyState icon={<Megaphone />} title="Нет доступа к рассылкам" />;
  const rows = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt));
  const options = await campaignOptions();
  const managers = new Map(options.managers.map((m) => [m.id, m.name]));
  const canCreate = can(user.actor, "campaigns", "create");
  const sent = rows.filter((c) => c.status === "sent");
  const totals = sent.reduce((a, c) => ({ sent: a.sent + c.stats.sent, opened: a.opened + c.stats.opened, clicked: a.clicked + c.stats.clicked }), { sent: 0, opened: 0, clicked: 0 });

  return (
    <>
      <PageHeader
        title="Рассылки"
        description="Сообщения сегменту клиентов в мессенджеры, на email и по SMS с подстановкой данных из CRM."
        actions={canCreate && <Button asChild><Link href="/campaigns?new=1"><Plus /> Новая рассылка</Link></Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Рассылок" value={rows.length} sub={`${plural(sent.length, "отправлена", "отправлены", "отправлено")}`} />
        <Stat label="Отправлено сообщений" value={totals.sent} />
        <Stat label="Открываемость" value={fmtPct(totals.sent ? (totals.opened / totals.sent) * 100 : 0)} sub={`${totals.opened} открытий`} tone="good" />
        <Stat label="Переходы" value={fmtPct(totals.sent ? (totals.clicked / totals.sent) * 100 : 0)} sub={`${totals.clicked} кликов`} />
      </div>
      {rows.length ? (
        <Table>
          <thead><tr><th>Название</th><th>Канал</th><th>Статус</th><th>Сегмент</th><th>Дата</th><th className="text-right">Получателей</th><th className="text-right">Отправлено</th><th className="text-right">Открыто</th><th className="text-right">Клики</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const st = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft;
              return (
                <tr key={c.id}>
                  <td><Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.subject && <div className="text-xs text-muted">{c.subject}</div>}</td>
                  <td><Badge tone={CHANNEL_TONE[c.channel] ?? "neutral"}>{CHANNEL_LABEL[c.channel]}</Badge></td>
                  <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                  <td className="max-w-[260px] truncate text-ink-2" title={segmentSummary(c.segment ?? {}, managers)}>{segmentSummary(c.segment ?? {}, managers)}</td>
                  <td className="whitespace-nowrap text-ink-2">{fmtDateTime(c.sentAt ?? c.createdAt)}</td>
                  <td className="text-right tnum">{c.stats.total}</td>
                  <td className="text-right tnum">{c.stats.sent}</td>
                  <td className="text-right tnum">{c.stats.opened}{c.stats.sent ? <span className="ml-1 text-xs text-muted">{fmtPct((c.stats.opened / c.stats.sent) * 100)}</span> : null}</td>
                  <td className="text-right tnum">{c.stats.clicked}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Megaphone />} title="Рассылок пока нет" description="Создайте первую: выберите сегмент клиентов, канал и текст с подстановками." action={canCreate && <Button asChild><Link href="/campaigns?new=1"><Plus /> Новая рассылка</Link></Button>} />
      )}
      {canCreate && <CampaignForm open={sp.new === "1"} options={options} />}
    </>
  );
}
