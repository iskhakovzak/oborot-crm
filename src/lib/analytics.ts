import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * 13–15. Аналитика по маркетингу, продажам и производству «за 1 клик».
 * Чистые функции расчёта по БД за период (from, to). Данные отдаются в страницу, PDF-отчёт и Telegram-бот.
 */

export type Period = { from: Date; to: Date };

export function periodDays(days: number): Period {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Понедельник недели, 00:00 */
export function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function monthStart(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}
const shortDate = (d: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(d).replace(".", "");
const shortMonth = (d: Date) => new Intl.DateTimeFormat("ru-RU", { month: "short", year: "2-digit" }).format(d).replace(".", "");

/** Сетка интервалов периода: недели (≤ 120 дней) или месяцы */
export function buckets(p: Period): { key: string; label: string; start: Date; end: Date }[] {
  const days = (p.to.getTime() - p.from.getTime()) / 86400_000;
  const byMonth = days > 120;
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  let cur = byMonth ? monthStart(p.from) : weekStart(p.from);
  while (cur.getTime() <= p.to.getTime()) {
    const next = byMonth ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1) : new Date(cur.getTime() + 7 * 86400_000);
    out.push({ key: cur.toISOString().slice(0, 10), label: byMonth ? shortMonth(cur) : shortDate(cur), start: cur, end: next });
    cur = next;
  }
  return out;
}
function bucketKey(bs: ReturnType<typeof buckets>, iso: string) {
  const t = new Date(iso).getTime();
  return bs.find((b) => t >= b.start.getTime() && t < b.end.getTime())?.key ?? null;
}
const inPeriod = (p: Period, iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= p.from.getTime() && new Date(iso).getTime() <= p.to.getTime();
const round = (v: number, d = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function salesPipelineIds() {
  const rows = await db.select({ id: schema.pipelines.id }).from(schema.pipelines).where(eq(schema.pipelines.kind, "sales"));
  return rows.map((r) => r.id);
}

// ───────────────────────────── 13. Маркетинг ─────────────────────────────

export type MarketingSource = { source: string; spend: number; leads: number; won: number; revenue: number; cpl: number; cac: number; romi: number | null; conversion: number };
export type MarketingReport = {
  period: Period;
  totals: { spend: number; leads: number; won: number; revenue: number; cpl: number; cac: number; romi: number | null; conversion: number };
  sources: MarketingSource[];
  leadsByWeek: { key: string; label: string; leads: number; won: number }[];
  campaigns: { campaign: string; source: string; leads: number; won: number; revenue: number; conversion: number }[];
};

export async function marketing(p: Period): Promise<MarketingReport> {
  const pids = await salesPipelineIds();
  const deals = pids.length
    ? await db.select().from(schema.deals).where(and(inArray(schema.deals.pipelineId, pids), gte(schema.deals.createdAt, p.from.toISOString()), lte(schema.deals.createdAt, p.to.toISOString())))
    : [];
  const costs = await db.select().from(schema.marketingCosts);

  // расход по источникам — пропорционально дням месяца, попавшим в период
  const spendBy = new Map<string, number>();
  for (const c of costs) {
    const [y, m] = c.month.split("-").map(Number);
    const ms = new Date(y, m - 1, 1), me = new Date(y, m, 1);
    const daysInMonth = (me.getTime() - ms.getTime()) / 86400_000;
    const overlap = Math.max(0, Math.min(me.getTime(), p.to.getTime()) - Math.max(ms.getTime(), p.from.getTime())) / 86400_000;
    if (overlap <= 0) continue;
    spendBy.set(c.source, (spendBy.get(c.source) ?? 0) + (c.amount * overlap) / daysInMonth);
  }

  const bySource = new Map<string, { leads: number; won: number; revenue: number }>();
  for (const d of deals) {
    const s = d.source ?? "Не указан";
    const row = bySource.get(s) ?? { leads: 0, won: 0, revenue: 0 };
    row.leads++;
    if (d.status === "won") { row.won++; row.revenue += d.amount; }
    bySource.set(s, row);
  }
  const names = new Set([...spendBy.keys(), ...bySource.keys()]);
  const metric = (spend: number, leads: number, won: number, revenue: number) => ({
    spend: round(spend), leads, won, revenue: round(revenue),
    cpl: leads ? round(spend / leads) : 0,
    cac: won ? round(spend / won) : 0,
    romi: spend > 0 ? round(((revenue - spend) / spend) * 100) : null,
    conversion: leads ? round((won / leads) * 100, 1) : 0,
  });
  const sources: MarketingSource[] = [...names]
    .map((source) => {
      const r = bySource.get(source) ?? { leads: 0, won: 0, revenue: 0 };
      return { source, ...metric(spendBy.get(source) ?? 0, r.leads, r.won, r.revenue) };
    })
    .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);

  const totalSpend = [...spendBy.values()].reduce((a, b) => a + b, 0);
  const totals = metric(totalSpend, deals.length, deals.filter((d) => d.status === "won").length, deals.filter((d) => d.status === "won").reduce((a, d) => a + d.amount, 0));

  const bs = buckets(p);
  const leadsByWeek = bs.map((b) => ({ key: b.key, label: b.label, leads: 0, won: 0 }));
  for (const d of deals) {
    const k = bucketKey(bs, d.createdAt);
    const row = leadsByWeek.find((r) => r.key === k);
    if (row) { row.leads++; if (d.status === "won") row.won++; }
  }

  const byCampaign = new Map<string, { source: string; leads: number; won: number; revenue: number }>();
  for (const d of deals) {
    const name = d.utm?.campaign ?? "Без UTM-метки";
    const row = byCampaign.get(name) ?? { source: d.utm?.source ?? (d.source ?? "—"), leads: 0, won: 0, revenue: 0 };
    row.leads++;
    if (d.status === "won") { row.won++; row.revenue += d.amount; }
    byCampaign.set(name, row);
  }
  const campaigns = [...byCampaign.entries()].map(([campaign, r]) => ({ campaign, ...r, revenue: round(r.revenue), conversion: r.leads ? round((r.won / r.leads) * 100, 1) : 0 })).sort((a, b) => b.leads - a.leads);

  return { period: p, totals, sources, leadsByWeek, campaigns };
}

// ───────────────────────────── 14. Продажи ─────────────────────────────

export type FunnelStage = { stageId: string; name: string; color: string; probability: number; openCount: number; openSum: number; reached: number; conversion: number | null };
export type ManagerRow = { managerId: string; name: string; color: string; deals: number; won: number; lost: number; revenue: number; avgCheck: number; conversion: number; cycleDays: number };
export type SalesReport = {
  period: Period;
  totals: { revenue: number; won: number; lost: number; created: number; openCount: number; openSum: number; avgCheck: number; forecast: number; conversion: number; cycleDays: number };
  revenueByWeek: { key: string; label: string; revenue: number; won: number }[];
  funnel: FunnelStage[];
  managers: ManagerRow[];
  lostReasons: { reason: string; count: number; sum: number }[];
};

export async function sales(p: Period): Promise<SalesReport> {
  const pids = await salesPipelineIds();
  const allDeals = pids.length ? await db.select().from(schema.deals).where(inArray(schema.deals.pipelineId, pids)) : [];
  const stages = pids.length ? await db.select().from(schema.stages).where(inArray(schema.stages.pipelineId, pids)).orderBy(schema.stages.order) : [];
  const users = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color }).from(schema.users);
  const userBy = new Map(users.map((u) => [u.id, u]));

  const created = allDeals.filter((d) => inPeriod(p, d.createdAt));
  const wonInPeriod = allDeals.filter((d) => d.status === "won" && inPeriod(p, d.closedAt ?? d.updatedAt));
  const lostInPeriod = allDeals.filter((d) => d.status === "lost" && inPeriod(p, d.closedAt ?? d.updatedAt));
  const open = allDeals.filter((d) => d.status === "open");
  const stageBy = new Map(stages.map((s) => [s.id, s]));

  const revenue = wonInPeriod.reduce((a, d) => a + d.amount, 0);
  const cycle = (d: typeof allDeals[number]) => Math.max(0, (new Date(d.closedAt ?? d.updatedAt).getTime() - new Date(d.createdAt).getTime()) / 86400_000);
  const forecast = open.reduce((a, d) => a + (d.amount * (stageBy.get(d.stageId)?.probability ?? 50)) / 100, 0);
  const totals = {
    revenue: round(revenue), won: wonInPeriod.length, lost: lostInPeriod.length, created: created.length,
    openCount: open.length, openSum: round(open.reduce((a, d) => a + d.amount, 0)),
    avgCheck: wonInPeriod.length ? round(revenue / wonInPeriod.length) : 0, forecast: round(forecast),
    conversion: wonInPeriod.length + lostInPeriod.length ? round((wonInPeriod.length / (wonInPeriod.length + lostInPeriod.length)) * 100, 1) : 0,
    cycleDays: round(avg(wonInPeriod.map(cycle)), 1),
  };

  const bs = buckets(p);
  const revenueByWeek = bs.map((b) => ({ key: b.key, label: b.label, revenue: 0, won: 0 }));
  for (const d of wonInPeriod) {
    const row = revenueByWeek.find((r) => r.key === bucketKey(bs, d.closedAt ?? d.updatedAt));
    if (row) { row.revenue = round(row.revenue + d.amount); row.won++; }
  }

  // воронка: открытые на каждом этапе + «дошли до этапа» = открытые на этом и следующих этапах + выигранные за период
  const openStages = stages.filter((s) => s.kind === "open");
  const funnel: FunnelStage[] = openStages.map((s, i) => {
    const mine = open.filter((d) => d.stageId === s.id);
    const reached = openStages.slice(i).reduce((a, st) => a + open.filter((d) => d.stageId === st.id).length, 0) + wonInPeriod.length;
    return { stageId: s.id, name: s.name, color: s.color, probability: s.probability, openCount: mine.length, openSum: round(mine.reduce((a, d) => a + d.amount, 0)), reached, conversion: null };
  });
  funnel.forEach((f, i) => {
    const next = i + 1 < funnel.length ? funnel[i + 1].reached : wonInPeriod.length;
    f.conversion = f.reached ? round((next / f.reached) * 100) : null;
  });

  const byManager = new Map<string, ManagerRow>();
  const touch = (id: string | null) => {
    const key = id ?? "—";
    let r = byManager.get(key);
    if (!r) { const u = id ? userBy.get(id) : null; r = { managerId: key, name: u?.name ?? "Без менеджера", color: u?.color ?? "#8a91a0", deals: 0, won: 0, lost: 0, revenue: 0, avgCheck: 0, conversion: 0, cycleDays: 0 }; byManager.set(key, r); }
    return r;
  };
  const cycles = new Map<string, number[]>();
  for (const d of created) touch(d.managerId).deals++;
  for (const d of wonInPeriod) { const r = touch(d.managerId); r.won++; r.revenue += d.amount; cycles.set(r.managerId, [...(cycles.get(r.managerId) ?? []), cycle(d)]); }
  for (const d of lostInPeriod) touch(d.managerId).lost++;
  const managers = [...byManager.values()].map((r) => ({ ...r, revenue: round(r.revenue), avgCheck: r.won ? round(r.revenue / r.won) : 0, conversion: r.won + r.lost ? round((r.won / (r.won + r.lost)) * 100) : 0, cycleDays: round(avg(cycles.get(r.managerId) ?? []), 1) })).sort((a, b) => b.revenue - a.revenue);

  const reasons = new Map<string, { count: number; sum: number }>();
  for (const d of lostInPeriod) { const k = d.lostReason ?? "Причина не указана"; const r = reasons.get(k) ?? { count: 0, sum: 0 }; r.count++; r.sum += d.amount; reasons.set(k, r); }
  const lostReasons = [...reasons.entries()].map(([reason, r]) => ({ reason, count: r.count, sum: round(r.sum) })).sort((a, b) => b.count - a.count);

  return { period: p, totals, revenueByWeek, funnel, managers, lostReasons };
}

// ───────────────────────────── 15. Производство ─────────────────────────────

export const PRODUCTION_STATUS: Record<"queued" | "in_progress" | "done" | "cancelled", string> = { queued: "В очереди", in_progress: "В работе", done: "Готово", cancelled: "Отменён" };

export type ProductionReport = {
  period: Period;
  totals: { orders: number; done: number; inProgress: number; queued: number; qty: number; defects: number; defectRate: number; onTimeRate: number; cycleDays: number; overdue: number };
  byStatus: { status: keyof typeof PRODUCTION_STATUS; label: string; count: number; qty: number }[];
  byAssignee: { assigneeId: string; name: string; color: string; orders: number; inProgress: number; done: number; qty: number; defects: number; onTime: number; cycleDays: number }[];
  doneByWeek: { key: string; label: string; done: number; created: number }[];
  byStage: { name: string; color: string; count: number }[];
};

export async function production(p: Period): Promise<ProductionReport> {
  const orders = await db.select().from(schema.productionOrders).where(and(gte(schema.productionOrders.createdAt, p.from.toISOString()), lte(schema.productionOrders.createdAt, p.to.toISOString())));
  const users = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color }).from(schema.users);
  const userBy = new Map(users.map((u) => [u.id, u]));
  const stages = await db.select().from(schema.stages);
  const stageBy = new Map(stages.map((s) => [s.id, s]));

  const done = orders.filter((o) => o.status === "done");
  const cycleOf = (o: typeof orders[number]) => Math.max(0, (new Date(o.finishedAt ?? o.createdAt).getTime() - new Date(o.startedAt ?? o.createdAt).getTime()) / 86400_000);
  const onTimeOf = (o: typeof orders[number]) => !o.plannedAt || !o.finishedAt || new Date(o.finishedAt).getTime() <= new Date(o.plannedAt).getTime();
  const qty = orders.reduce((a, o) => a + o.qty, 0);
  const defects = orders.reduce((a, o) => a + o.defects, 0);
  const now = Date.now();
  const overdue = orders.filter((o) => o.status !== "done" && o.status !== "cancelled" && o.plannedAt && new Date(o.plannedAt).getTime() < now).length;
  const totals = {
    orders: orders.length, done: done.length, inProgress: orders.filter((o) => o.status === "in_progress").length, queued: orders.filter((o) => o.status === "queued").length,
    qty, defects, defectRate: qty ? round((defects / qty) * 100, 1) : 0,
    onTimeRate: done.length ? round((done.filter(onTimeOf).length / done.length) * 100) : 0,
    cycleDays: round(avg(done.map(cycleOf)), 1), overdue,
  };
  const byStatus = (Object.keys(PRODUCTION_STATUS) as (keyof typeof PRODUCTION_STATUS)[]).map((status) => ({ status, label: PRODUCTION_STATUS[status], count: orders.filter((o) => o.status === status).length, qty: orders.filter((o) => o.status === status).reduce((a, o) => a + o.qty, 0) }));

  const byA = new Map<string, ProductionReport["byAssignee"][number] & { cycles: number[] }>();
  for (const o of orders) {
    const key = o.assigneeId ?? "—";
    let r = byA.get(key);
    if (!r) { const u = o.assigneeId ? userBy.get(o.assigneeId) : null; r = { assigneeId: key, name: u?.name ?? "Не назначен", color: u?.color ?? "#8a91a0", orders: 0, inProgress: 0, done: 0, qty: 0, defects: 0, onTime: 0, cycleDays: 0, cycles: [] }; byA.set(key, r); }
    r.orders++; r.qty += o.qty; r.defects += o.defects;
    if (o.status === "in_progress") r.inProgress++;
    if (o.status === "done") { r.done++; r.cycles.push(cycleOf(o)); if (onTimeOf(o)) r.onTime++; }
  }
  const byAssignee = [...byA.values()].map(({ cycles, ...r }) => ({ ...r, cycleDays: round(avg(cycles), 1) })).sort((a, b) => b.orders - a.orders);

  const bs = buckets(p);
  const doneByWeek = bs.map((b) => ({ key: b.key, label: b.label, done: 0, created: 0 }));
  for (const o of orders) {
    const c = doneByWeek.find((r) => r.key === bucketKey(bs, o.createdAt)); if (c) c.created++;
    if (o.status === "done" && o.finishedAt) { const d = doneByWeek.find((r) => r.key === bucketKey(bs, o.finishedAt!)); if (d) d.done++; }
  }
  const stageCount = new Map<string, number>();
  for (const o of orders) if (o.stageId) stageCount.set(o.stageId, (stageCount.get(o.stageId) ?? 0) + 1);
  const byStage = [...stageCount.entries()].map(([id, count]) => ({ name: stageBy.get(id)?.name ?? "—", color: stageBy.get(id)?.color ?? "#8a91a0", count, order: stageBy.get(id)?.order ?? 0 })).sort((a, b) => a.order - b.order).map(({ order: _o, ...r }) => r);

  return { period: p, totals, byStatus, byAssignee, doneByWeek, byStage };
}
