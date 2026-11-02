import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./utils";
import { nextNumber } from "./counters";
import { logActivity } from "./activity";

/** 26. Бесшовная передача клиента из продажи в отгрузку / услуги / производство: создаётся связанная сделка в целевой воронке со всеми позициями */
export async function handoffDeal(dealId: string, kind: "shipping" | "service" | "production", userId?: string | null) {
  const deal = await db.query.deals.findFirst({ where: eq(schema.deals.id, dealId) });
  if (!deal) throw new Error("Сделка не найдена");
  const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, kind) });
  if (!pipeline) throw new Error(`Воронка «${kind}» не настроена`);
  const first = await db.query.stages.findFirst({ where: eq(schema.stages.pipelineId, pipeline.id), orderBy: asc(schema.stages.order) });
  if (!first) throw new Error("В воронке нет этапов");
  const items = await db.query.dealItems.findMany({ where: eq(schema.dealItems.dealId, dealId) });
  if (kind === "production") {
    const n = await nextNumber("production");
    const id = newId("prd");
    await db.insert(schema.productionOrders).values({ id, number: n, dealId, companyId: deal.companyId, title: `${deal.title} — заказ №${n}`, stageId: first.id, qty: items.reduce((s, i) => s + i.qty, 0) || 1, plannedAt: new Date(Date.now() + 7 * 86400_000).toISOString(), status: "queued", notes: items.map((i) => `${i.name} × ${i.qty}`).join("; ") });
    await logActivity({ type: "stage", title: `Передано в производство: заказ №${n}`, dealId, companyId: deal.companyId, userId, meta: { productionOrderId: id } });
    return { id, kind, number: n };
  }
  const existing = await db.query.deals.findFirst({ where: (d, { and, eq }) => and(eq(d.parentDealId, dealId), eq(d.pipelineId, pipeline.id)) });
  if (existing) return { id: existing.id, kind, number: existing.number };
  const n = await nextNumber("deal");
  const id = newId("deal");
  await db.insert(schema.deals).values({ id, number: n, title: deal.title, companyId: deal.companyId, contactId: deal.contactId, pipelineId: pipeline.id, stageId: first.id, amount: deal.amount, managerId: deal.managerId, status: "open", source: deal.source, utm: deal.utm, ymClientId: deal.ymClientId, parentDealId: dealId, nextStep: kind === "shipping" ? "Собрать и отгрузить заказ" : "Назначить бригаду и дату" });
  if (items.length) await db.insert(schema.dealItems).values(items.map((i) => ({ ...i, id: newId("itm"), dealId: id })));
  await logActivity({ type: "stage", title: `Передано в ${kind === "shipping" ? "отгрузку" : "услуги"}: сделка №${n}`, body: "Позиции, контакт и история перенесены без ручного ввода", dealId, companyId: deal.companyId, userId, meta: { childDealId: id } });
  await logActivity({ type: "stage", title: `Получено из продаж (сделка №${deal.number})`, dealId: id, companyId: deal.companyId, userId, meta: { parentDealId: dealId } });
  return { id, kind, number: n };
}
