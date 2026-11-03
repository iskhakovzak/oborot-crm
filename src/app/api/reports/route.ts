import { getCurrentUser } from "@/lib/auth";
import { can, hiddenFields } from "@/lib/permissions";
import { marketing, sales, production, periodDays, type MarketingReport, type SalesReport, type ProductionReport } from "@/lib/analytics";
import { Pdf, dateRu } from "@/lib/documents/pdf";
import { getSetting } from "@/lib/settings";
import { rgb } from "pdf-lib";

const MUTED = rgb(0.54, 0.57, 0.63);

export const dynamic = "force-dynamic";

const TYPES = { marketing: "Маркетинг", sales: "Продажи", production: "Производство" } as const;
type ReportType = keyof typeof TYPES;
const FILE = { marketing: "маркетинг", sales: "продажи", production: "производство" } as const;

const money = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(v) + " сум";
const num = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(v);
const pct = (v: number, d = 0) => `${v.toFixed(d)}%`;

/** 13–15. Отчёт за 1 клик: PDF по маркетингу, продажам или производству за период */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Требуется вход", { status: 401 });
  if (!can(user.actor, "analytics", "view")) return new Response("Нет доступа к аналитике", { status: 403 });
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "sales") as ReportType;
  if (!(type in TYPES)) return new Response("Неизвестный тип отчёта", { status: 400 });
  if (hiddenFields(user.actor, "analytics").includes(type)) return new Response("Этот раздел аналитики скрыт для вашей роли", { status: 403 });
  const days = Math.min(365, Math.max(7, Number(url.searchParams.get("days")) || 90));
  const period = periodDays(days);
  const profile = await getSetting("company");

  const pdf = await Pdf.create();
  pdf.text(`${profile.name} · WS_CRM`, { size: 9, color: MUTED });
  pdf.heading(`Отчёт: ${TYPES[type].toLowerCase()}`, `Период: ${dateRu(period.from.toISOString())} — ${dateRu(period.to.toISOString())} (${days} дн.) · сформирован ${dateRu(new Date().toISOString())}, ${user.name}`);

  if (type === "marketing") renderMarketing(pdf, await marketing(period));
  if (type === "sales") renderSales(pdf, await sales(period));
  if (type === "production") renderProduction(pdf, await production(period));

  pdf.footer(`${profile.name} · Отчёт «${TYPES[type]}» · WS_CRM`);
  const bytes = await pdf.bytes();
  const filename = `Отчёт-${FILE[type]}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="report-${type}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}

/** Ряд ключевых показателей: подпись сверху, крупное значение снизу */
function stats(pdf: Pdf, items: [string, string][]) {
  const perRow = 4;
  for (let i = 0; i < items.length; i += perRow) {
    const row = items.slice(i, i + perRow);
    const colW = (pdf.W - 2 * pdf.M) / perRow;
    pdf.ensure(44);
    const y0 = pdf.y;
    row.forEach(([k, v], j) => { pdf.at(k, pdf.M + j * colW, y0, { size: 8.5, color: MUTED }); pdf.at(v, pdf.M + j * colW, y0 - 13, { size: 14, bold: true }); });
    pdf.y = y0 - 38;
  }
  pdf.rule();
  pdf.gap(6);
}
function section(pdf: Pdf, title: string) { pdf.gap(8); pdf.text(title, { bold: true, size: 10.5 }); pdf.gap(4); }

function renderMarketing(pdf: Pdf, d: MarketingReport) {
  const t = d.totals;
  stats(pdf, [["Расход на рекламу", money(t.spend)], ["Лиды", String(t.leads)], ["Оплаты", `${t.won} · ${pct(t.conversion, 1)}`], ["Выручка", money(t.revenue)], ["CPL", money(t.cpl)], ["CAC", money(t.cac)], ["ROMI", t.romi == null ? "—" : `${t.romi > 0 ? "+" : ""}${num(t.romi)}%`], ["Источников", String(d.sources.length)]]);
  section(pdf, "Эффективность источников");
  pdf.table(
    [{ title: "Источник", w: 125 }, { title: "Расход", w: 66, align: "right" }, { title: "Лиды", w: 40, align: "right" }, { title: "Оплаты", w: 46, align: "right" }, { title: "Конв.", w: 44, align: "right" }, { title: "Выручка", w: 72, align: "right" }, { title: "CPL", w: 52, align: "right" }, { title: "ROMI", w: 54, align: "right" }],
    d.sources.map((s) => [s.source, s.spend ? money(s.spend) : "—", String(s.leads), String(s.won), pct(s.conversion, 1), money(s.revenue), s.cpl ? money(s.cpl) : "—", s.romi == null ? "—" : `${num(s.romi)}%`]),
    { zebra: true },
  );
  section(pdf, "Лиды по неделям");
  pdf.table([{ title: "Неделя", w: 150 }, { title: "Лиды", w: 120, align: "right" }, { title: "Оплачено", w: 120, align: "right" }, { title: "Конверсия", w: 109, align: "right" }], d.leadsByWeek.map((w) => [w.label, String(w.leads), String(w.won), w.leads ? pct((w.won / w.leads) * 100) : "—"]));
  section(pdf, "Воронка по рекламным кампаниям (UTM)");
  pdf.table([{ title: "Кампания", w: 160 }, { title: "Источник", w: 110 }, { title: "Лиды", w: 56, align: "right" }, { title: "Оплаты", w: 56, align: "right" }, { title: "Конв.", w: 50, align: "right" }, { title: "Выручка", w: 67, align: "right" }], d.campaigns.map((c) => [c.campaign, c.source, String(c.leads), String(c.won), pct(c.conversion, 1), money(c.revenue)]), { zebra: true });
}

function renderSales(pdf: Pdf, d: SalesReport) {
  const t = d.totals;
  stats(pdf, [["Выручка", money(t.revenue)], ["Оплат", String(t.won)], ["Средний чек", money(t.avgCheck)], ["Конверсия в оплату", pct(t.conversion, 1)], ["Новых сделок", String(t.created)], ["В работе", `${t.openCount} · ${money(t.openSum)}`], ["Прогноз", money(t.forecast)], ["Цикл сделки", `${num(t.cycleDays)} дн.`]]);
  section(pdf, "Воронка продаж");
  pdf.table([{ title: "Этап", w: 170 }, { title: "Открыто", w: 70, align: "right" }, { title: "Сумма открытых", w: 110, align: "right" }, { title: "Дошли до этапа", w: 90, align: "right" }, { title: "Конверсия далее", w: 59, align: "right" }], [...d.funnel.map((f) => [f.name, String(f.openCount), money(f.openSum), String(f.reached), f.conversion == null ? "—" : pct(f.conversion)]), ["Оплачено", "", "", String(t.won), ""]]);
  section(pdf, "Менеджеры");
  pdf.table(
    [{ title: "Менеджер", w: 135 }, { title: "Сделок", w: 48, align: "right" }, { title: "Выиграно", w: 56, align: "right" }, { title: "Отказов", w: 52, align: "right" }, { title: "Конв.", w: 44, align: "right" }, { title: "Выручка", w: 78, align: "right" }, { title: "Ср. чек", w: 66, align: "right" }, { title: "Цикл", w: 20, align: "right" }],
    d.managers.map((m) => [m.name, String(m.deals), String(m.won), String(m.lost), pct(m.conversion), money(m.revenue), money(m.avgCheck), m.cycleDays ? num(m.cycleDays) : "—"]),
    { zebra: true },
  );
  section(pdf, "Выручка по неделям");
  pdf.table([{ title: "Неделя", w: 200 }, { title: "Оплат", w: 120, align: "right" }, { title: "Выручка", w: 179, align: "right" }], d.revenueByWeek.map((w) => [w.label, String(w.won), money(w.revenue)]));
  section(pdf, "Причины отказов");
  pdf.table([{ title: "Причина", w: 260 }, { title: "Сделок", w: 100, align: "right" }, { title: "Сумма", w: 139, align: "right" }], d.lostReasons.length ? d.lostReasons.map((r) => [r.reason, String(r.count), money(r.sum)]) : [["Отказов за период нет", "", ""]]);
}

function renderProduction(pdf: Pdf, d: ProductionReport) {
  const t = d.totals;
  stats(pdf, [["Заказов", String(t.orders)], ["Выполнено", String(t.done)], ["В работе / очередь", `${t.inProgress} / ${t.queued}`], ["Средний цикл", `${num(t.cycleDays)} дн.`], ["В срок", pct(t.onTimeRate)], ["Брак", pct(t.defectRate, 1)], ["Просрочено", String(t.overdue)], ["Единиц", num(t.qty)]]);
  section(pdf, "Заказы по статусам");
  pdf.table([{ title: "Статус", w: 260 }, { title: "Заказов", w: 120, align: "right" }, { title: "Единиц", w: 119, align: "right" }], d.byStatus.map((s) => [s.label, String(s.count), num(s.qty)]));
  section(pdf, "Загрузка исполнителей");
  pdf.table(
    [{ title: "Исполнитель", w: 150 }, { title: "Заказов", w: 56, align: "right" }, { title: "В работе", w: 56, align: "right" }, { title: "Готово", w: 52, align: "right" }, { title: "В срок", w: 52, align: "right" }, { title: "Ед.", w: 44, align: "right" }, { title: "Брак", w: 40, align: "right" }, { title: "Цикл", w: 49, align: "right" }],
    d.byAssignee.map((a) => [a.name, String(a.orders), String(a.inProgress), String(a.done), a.done ? `${a.onTime}/${a.done}` : "—", num(a.qty), String(a.defects), a.cycleDays ? num(a.cycleDays) : "—"]),
    { zebra: true },
  );
  section(pdf, "Динамика по неделям");
  pdf.table([{ title: "Неделя", w: 200 }, { title: "Создано", w: 150, align: "right" }, { title: "Выполнено", w: 149, align: "right" }], d.doneByWeek.map((w) => [w.label, String(w.created), String(w.done)]));
  if (d.byStage.length) {
    section(pdf, "Этапы производства");
    pdf.table([{ title: "Этап", w: 350 }, { title: "Заказов", w: 149, align: "right" }], d.byStage.map((s) => [s.name, String(s.count)]));
  }
}
