import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileDown, Megaphone, Factory, TrendingUp, BarChart3 } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, hiddenFields } from "@/lib/permissions";
import { marketing, sales, production, periodDays, type MarketingReport, type SalesReport, type ProductionReport } from "@/lib/analytics";
import { resolve } from "@/lib/integrations/registry";
import { fmtMoney, fmtNum, fmtPct, fmtDateTime, fmtDate, plural } from "@/lib/format";
import { PageHeader, Section, Stat, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import { BarsChart, TrendChart, HBars, Funnel, Segments, CHART } from "@/components/analytics/charts";
import { ResendButton } from "@/components/analytics/resend-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "marketing", label: "Маркетинг", icon: Megaphone },
  { key: "sales", label: "Продажи", icon: TrendingUp },
  { key: "production", label: "Производство", icon: Factory },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const DAYS = [30, 90, 180];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!can(user.actor, "analytics", "view")) return <EmptyState icon={<BarChart3 />} title="Нет доступа к аналитике" description="Попросите администратора открыть раздел «Аналитика» для вашей роли." />;
  const hidden = hiddenFields(user.actor, "analytics");
  const tabs = TABS.filter((t) => !hidden.includes(t.key));
  if (!tabs.length) return <EmptyState icon={<BarChart3 />} title="Все разделы аналитики скрыты для вашей роли" />;
  const tab: TabKey = (tabs.find((t) => t.key === sp.tab) ?? tabs[0]).key;
  const days = DAYS.includes(Number(sp.days)) ? Number(sp.days) : 90;
  const period = periodDays(days);
  const periodLabel = `${fmtDate(period.from.toISOString(), { day: "numeric", month: "long" })} — ${fmtDate(period.to.toISOString(), { day: "numeric", month: "long" })}`;

  return (
    <>
      <PageHeader
        title="Аналитика"
        description={`Маркетинг, продажи и производство за выбранный период. ${periodLabel}.`}
        actions={
          <Button asChild variant="primary">
            <a href={`/api/reports?type=${tab}&days=${days}`} target="_blank" rel="noopener"><FileDown /> Отчёт за 1 клик</a>
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1">
          {tabs.map((t) => (
            <Link key={t.key} href={`/analytics?tab=${t.key}&days=${days}`} className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-colors", tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
              <t.icon className="size-3.5" /> {t.label}
            </Link>
          ))}
        </nav>
        <div className="inline-flex items-center gap-1 text-[13px]">
          <span className="mr-1 text-muted">Период:</span>
          {DAYS.map((d) => (
            <Link key={d} href={`/analytics?tab=${tab}&days=${d}`} className={cn("rounded-[7px] px-2.5 py-1 tnum", days === d ? "bg-ink text-white" : "text-ink-2 hover:bg-black/5")}>
              {d} дней
            </Link>
          ))}
        </div>
      </div>
      {tab === "marketing" && <MarketingTab data={await marketing(period)} />}
      {tab === "sales" && <SalesTab data={await sales(period)} />}
      {tab === "production" && <ProductionTab data={await production(period)} />}
    </>
  );
}

// ───────────────────────────── Маркетинг ─────────────────────────────

async function MarketingTab({ data }: { data: MarketingReport }) {
  const t = data.totals;
  const romi = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${fmtNum(v)}%`);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Расход на рекламу" value={fmtMoney(t.spend)} sub="пропорционально периоду" />
        <Stat label="Лиды" value={fmtNum(t.leads)} sub="сделок создано" />
        <Stat label="Оплаты" value={fmtNum(t.won)} sub={`конверсия ${fmtPct(t.conversion, 1)}`} tone="good" />
        <Stat label="Выручка" value={fmtMoney(t.revenue)} sub="по оплаченным сделкам" />
        <Stat label="CPL / CAC" value={<span className="tnum">{fmtMoney(t.cpl)} <span className="text-muted">/</span> {fmtMoney(t.cac)}</span>} sub="стоимость лида / клиента" />
        <Stat label="ROMI" value={romi(t.romi)} tone={t.romi == null ? undefined : t.romi >= 0 ? "good" : "accent"} sub="(выручка − расход) / расход" />
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Section title="Расход и выручка по источникам" description="Источники с рекламным бюджетом и сделками за период" className="lg:col-span-3">
          <BarsChart data={data.sources.slice(0, 8).map((s) => ({ source: s.source, spend: s.spend, revenue: s.revenue }))} xKey="source" series={[{ key: "spend", label: "Расход", color: CHART.soft, money: true }, { key: "revenue", label: "Выручка", color: CHART.ink, money: true }]} height={260} />
        </Section>
        <Section title="Лиды по неделям" description="Создано сделок и сколько из них оплачено" className="lg:col-span-2">
          <TrendChart data={data.leadsByWeek} xKey="label" series={[{ key: "leads", label: "Лиды", color: CHART.info }, { key: "won", label: "Оплачено", color: CHART.good }]} height={260} />
        </Section>
      </div>
      <Section title="Эффективность источников" description="CPL — стоимость лида, CAC — стоимость клиента, ROMI — возврат маркетинговых инвестиций">
        <Table className="border-0 rounded-none">
          <thead><tr><th>Источник</th><th className="text-right">Расход</th><th className="text-right">Лиды</th><th className="text-right">Оплаты</th><th className="text-right">Конверсия</th><th className="text-right">Выручка</th><th className="text-right">CPL</th><th className="text-right">CAC</th><th className="text-right">ROMI</th></tr></thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.source}>
                <td className="font-medium">{s.source}</td>
                <td className="text-right tnum">{s.spend ? fmtMoney(s.spend) : <span className="text-muted">—</span>}</td>
                <td className="text-right tnum">{s.leads}</td>
                <td className="text-right tnum">{s.won}</td>
                <td className="text-right tnum">{fmtPct(s.conversion, 1)}</td>
                <td className="text-right tnum">{fmtMoney(s.revenue)}</td>
                <td className="text-right tnum">{s.cpl ? fmtMoney(s.cpl) : <span className="text-muted">—</span>}</td>
                <td className="text-right tnum">{s.cac ? fmtMoney(s.cac) : <span className="text-muted">—</span>}</td>
                <td className={cn("text-right tnum font-medium", s.romi == null ? "text-muted" : s.romi >= 0 ? "text-good" : "text-accent")}>{romi(s.romi)}</td>
              </tr>
            ))}
            {!data.sources.length && <tr><td colSpan={9} className="text-center text-muted">Нет сделок и расходов за период</td></tr>}
          </tbody>
        </Table>
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Воронка по рекламным кампаниям" description="По UTM-метке utm_campaign в сделках">
          <Table className="border-0 rounded-none">
            <thead><tr><th>Кампания</th><th>Источник</th><th className="text-right">Лиды</th><th className="text-right">Оплаты</th><th className="text-right">Конверсия</th><th className="text-right">Выручка</th></tr></thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.campaign}>
                  <td className="font-medium">{c.campaign}</td>
                  <td className="text-ink-2">{c.source}</td>
                  <td className="text-right tnum">{c.leads}</td>
                  <td className="text-right tnum">{c.won}</td>
                  <td className="text-right tnum">{fmtPct(c.conversion, 1)}</td>
                  <td className="text-right tnum">{fmtMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
        <MetrikaBlock />
      </div>
    </div>
  );
}

const EXPORT_TONE: Record<string, Tone> = { sent: "good", sandbox: "info", queued: "warn", error: "accent" };
const EXPORT_LABEL: Record<string, string> = { sent: "Отправлено", sandbox: "Демо", queued: "В очереди", error: "Ошибка" };

/** 27. Передача лидов и продаж в Яндекс Метрику / Google Analytics */
async function MetrikaBlock() {
  const r = await resolve("analytics");
  const rows = await db
    .select({ e: schema.analyticsExports, dealNumber: schema.deals.number, dealTitle: schema.deals.title })
    .from(schema.analyticsExports)
    .leftJoin(schema.deals, eq(schema.analyticsExports.dealId, schema.deals.id))
    .orderBy(desc(schema.analyticsExports.createdAt))
    .limit(10);
  return (
    <Section
      title="Передача в аналитику"
      description={`${r.name}: лиды и продажи уходят как офлайн-конверсии по ClientID`}
      action={<Badge tone={r.live ? "good" : "info"} dot>{r.live ? "Подключено" : "Демо-режим"}</Badge>}
    >
      <p className="mb-3 text-[13px] text-muted">
        ClientID Метрики (поле <code className="rounded bg-surface-2 px-1">ymClientId</code>) сохраняется в сделке из формы на сайте или виджета — по нему Метрика связывает оплату с рекламным кликом. Без ClientID конверсию не к чему привязать.
        {!r.live && " Чтобы отправлять по-настоящему, укажите номер счётчика и OAuth-токен в разделе «Интеграции»."}
      </p>
      <div className="divide-y divide-line">
        {rows.map(({ e, dealNumber, dealTitle }) => (
          <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
            <Badge tone={EXPORT_TONE[e.status] ?? "neutral"}>{EXPORT_LABEL[e.status] ?? e.status}</Badge>
            <Link href={e.dealId ? `/deals/${e.dealId}` : "#"} className="font-medium hover:underline">{dealNumber ? `№${dealNumber} ` : ""}{dealTitle ?? "Сделка удалена"}</Link>
            <span className="text-muted">цель <span className="text-ink-2">{e.goal}</span></span>
            <span className="text-muted">ClientID <span className="tnum text-ink-2">{e.clientId ?? "—"}</span></span>
            {e.revenue != null && <span className="tnum text-ink-2">{fmtMoney(e.revenue)}</span>}
            <span className="ml-auto text-xs text-muted">{fmtDateTime(e.createdAt)}</span>
            {(e.status === "error" || e.status === "queued") && <ResendButton exportId={e.id} />}
            {e.response && <div className="basis-full text-xs text-muted">{e.response}</div>}
          </div>
        ))}
        {!rows.length && <div className="py-6 text-center text-[13px] text-muted">Пока ничего не отправлялось: конверсии появятся после создания сделки с ClientID и оплаты.</div>}
      </div>
    </Section>
  );
}

// ───────────────────────────── Продажи ─────────────────────────────

function SalesTab({ data }: { data: SalesReport }) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Выручка" value={fmtMoney(t.revenue)} sub={`${plural(t.won, "оплата", "оплаты", "оплат")} за период`} tone="good" />
        <Stat label="Средний чек" value={fmtMoney(t.avgCheck)} />
        <Stat label="Конверсия в оплату" value={fmtPct(t.conversion, 1)} sub={`${t.won} выиграно · ${t.lost} отказов`} />
        <Stat label="Новых сделок" value={fmtNum(t.created)} sub="создано за период" />
        <Stat label="В работе" value={fmtMoney(t.openSum)} sub={plural(t.openCount, "открытая сделка", "открытые сделки", "открытых сделок")} />
        <Stat label="Прогноз" value={fmtMoney(t.forecast)} sub="сумма × вероятность этапа" tone="info" />
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Section title="Выручка по неделям" description="Оплаченные сделки по дате закрытия" className="lg:col-span-3">
          <TrendChart kind="area" data={data.revenueByWeek} xKey="label" series={[{ key: "revenue", label: "Выручка", color: CHART.ink, money: true }]} height={260} />
        </Section>
        <Section title="Воронка продаж" description="Сколько сделок дошло до этапа и конверсия на следующий" className="lg:col-span-2">
          <Funnel stages={data.funnel} won={t.won} />
        </Section>
      </div>
      <Section title="Менеджеры" description={`Средний цикл сделки — ${fmtNum(t.cycleDays)} дн. от создания до оплаты`}>
        <Table className="border-0 rounded-none">
          <thead><tr><th>Менеджер</th><th className="text-right">Сделок</th><th className="text-right">Выиграно</th><th className="text-right">Отказов</th><th className="text-right">Конверсия</th><th className="text-right">Выручка</th><th className="text-right">Средний чек</th><th className="text-right">Цикл, дн.</th></tr></thead>
          <tbody>
            {data.managers.map((m) => (
              <tr key={m.managerId}>
                <td><span className="flex items-center gap-2"><Avatar name={m.name} color={m.color} size={24} /><span className="font-medium">{m.name}</span></span></td>
                <td className="text-right tnum">{m.deals}</td>
                <td className="text-right tnum text-good">{m.won}</td>
                <td className="text-right tnum">{m.lost}</td>
                <td className="text-right tnum">{fmtPct(m.conversion)}</td>
                <td className="text-right tnum font-medium">{fmtMoney(m.revenue)}</td>
                <td className="text-right tnum">{fmtMoney(m.avgCheck)}</td>
                <td className="text-right tnum">{m.cycleDays ? fmtNum(m.cycleDays) : "—"}</td>
              </tr>
            ))}
            {!data.managers.length && <tr><td colSpan={8} className="text-center text-muted">Нет сделок за период</td></tr>}
          </tbody>
        </Table>
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Причины отказов" description={`${plural(t.lost, "отказ", "отказа", "отказов")} за период`}>
          <HBars rows={data.lostReasons.map((r) => ({ label: r.reason, value: r.count, display: plural(r.count, "сделка", "сделки", "сделок"), sub: fmtMoney(r.sum) }))} color={CHART.muted} />
        </Section>
        <Section title="Оплаты по неделям" description="Количество выигранных сделок">
          <BarsChart data={data.revenueByWeek} xKey="label" series={[{ key: "won", label: "Оплат", color: CHART.good }]} height={200} />
        </Section>
      </div>
    </div>
  );
}

// ───────────────────────────── Производство ─────────────────────────────

const STATUS_COLOR: Record<string, string> = { queued: CHART.soft, in_progress: CHART.info, done: CHART.good, cancelled: CHART.muted };

function ProductionTab({ data }: { data: ProductionReport }) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Заказов" value={fmtNum(t.orders)} sub={`${t.queued} в очереди · ${t.inProgress} в работе`} />
        <Stat label="Выполнено" value={fmtNum(t.done)} sub={`${fmtNum(t.qty)} ед. в заказах`} tone="good" />
        <Stat label="Средний цикл" value={`${fmtNum(t.cycleDays)} дн.`} sub="от запуска до готовности" />
        <Stat label="В срок" value={fmtPct(t.onTimeRate)} sub="готово не позже плана" tone={t.onTimeRate >= 80 ? "good" : "warn"} />
        <Stat label="Брак" value={fmtPct(t.defectRate, 1)} sub={`${plural(t.defects, "дефект", "дефекта", "дефектов")}`} tone={t.defectRate > 5 ? "accent" : undefined} />
        <Stat label="Просрочено" value={fmtNum(t.overdue)} sub="план уже прошёл" tone={t.overdue ? "accent" : undefined} />
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Section title="Заказы по статусам" className="lg:col-span-2">
          <BarsChart data={data.byStatus.map((s) => ({ label: s.label, count: s.count }))} xKey="label" series={[{ key: "count", label: "Заказов", color: CHART.ink }]} height={220} />
          <div className="mt-4"><Segments parts={data.byStatus.map((s) => ({ label: s.label, value: s.count, color: STATUS_COLOR[s.status] }))} /></div>
        </Section>
        <Section title="Динамика по неделям" description="Создано заказов и выполнено" className="lg:col-span-3">
          <TrendChart data={data.doneByWeek} xKey="label" series={[{ key: "created", label: "Создано", color: CHART.soft }, { key: "done", label: "Выполнено", color: CHART.good }]} height={260} />
        </Section>
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Section title="Загрузка исполнителей" className="lg:col-span-3">
          <Table className="border-0 rounded-none">
            <thead><tr><th>Исполнитель</th><th className="text-right">Заказов</th><th className="text-right">В работе</th><th className="text-right">Готово</th><th className="text-right">В срок</th><th className="text-right">Ед.</th><th className="text-right">Брак</th><th className="text-right">Цикл, дн.</th></tr></thead>
            <tbody>
              {data.byAssignee.map((a) => (
                <tr key={a.assigneeId}>
                  <td><span className="flex items-center gap-2"><Avatar name={a.name} color={a.color} size={24} /><span className="font-medium">{a.name}</span></span></td>
                  <td className="text-right tnum">{a.orders}</td>
                  <td className="text-right tnum text-info">{a.inProgress}</td>
                  <td className="text-right tnum text-good">{a.done}</td>
                  <td className="text-right tnum">{a.done ? `${a.onTime}/${a.done}` : "—"}</td>
                  <td className="text-right tnum">{fmtNum(a.qty)}</td>
                  <td className={cn("text-right tnum", a.defects && "text-accent")}>{a.defects}</td>
                  <td className="text-right tnum">{a.cycleDays ? fmtNum(a.cycleDays) : "—"}</td>
                </tr>
              ))}
              {!data.byAssignee.length && <tr><td colSpan={8} className="text-center text-muted">Нет заказов за период</td></tr>}
            </tbody>
          </Table>
        </Section>
        <Section title="Этапы производства" description="Где сейчас находятся заказы" className="lg:col-span-2">
          <HBars rows={data.byStage.map((s) => ({ label: s.name, value: s.count, display: plural(s.count, "заказ", "заказа", "заказов"), color: s.color }))} />
        </Section>
      </div>
    </div>
  );
}
