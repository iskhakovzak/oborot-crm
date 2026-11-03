"use server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { handoffDeal } from "@/lib/handoff";
import { nextNumber } from "@/lib/counters";
import { newId } from "@/lib/utils";

type Result = { ok: true; message: string; id?: string } | { ok: false; error: string };

function revalidate(dealId?: string | null) {
  revalidatePath("/production");
  if (dealId) revalidatePath(`/deals/${dealId}`);
}

async function productionStages() {
  const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, "production") });
  if (!pipeline) throw new Error("Воронка производства не настроена");
  return db.query.stages.findMany({ where: eq(schema.stages.pipelineId, pipeline.id), orderBy: asc(schema.stages.order) });
}

/** Перенос заказа между этапами: статус, даты старта/финиша, запись в журнал сделки */
export async function moveProductionOrder(id: string, stageId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "production", "edit")) return { ok: false, error: "Нет прав на изменение заказов" };
  const order = await db.query.productionOrders.findFirst({ where: eq(schema.productionOrders.id, id) });
  if (!order) return { ok: false, error: "Заказ не найден" };
  if (order.stageId === stageId) return { ok: true, message: "Без изменений" };
  const stages = await productionStages();
  const to = stages.find((s) => s.id === stageId);
  if (!to) return { ok: false, error: "Этап не найден" };
  const from = stages.find((s) => s.id === order.stageId);
  const isDone = to.kind === "won" || to.order === stages.length - 1;
  const status: "queued" | "in_progress" | "done" = isDone ? "done" : to.order === 0 ? "queued" : "in_progress";
  const now = new Date().toISOString();
  await db.update(schema.productionOrders).set({
    stageId,
    status,
    startedAt: to.order >= 1 ? order.startedAt ?? now : order.startedAt,
    finishedAt: isDone ? order.finishedAt ?? now : null,
  }).where(eq(schema.productionOrders.id, id));
  await logActivity({ type: "stage", title: `Заказ №${order.number}: ${from?.name ?? "—"} → ${to.name}`, body: isDone ? "Заказ готов к отгрузке" : null, dealId: order.dealId, companyId: order.companyId, userId: user.id, meta: { productionOrderId: id, fromStage: from?.name, toStage: to.name } });
  revalidate(order.dealId);
  return { ok: true, message: `Заказ №${order.number} → ${to.name}` };
}

export async function updateProductionOrder(id: string, p: { assigneeId?: string | null; plannedAt?: string | null; qty?: number; defects?: number; notes?: string | null }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "production", "edit")) return { ok: false, error: "Нет прав на изменение заказов" };
  const order = await db.query.productionOrders.findFirst({ where: eq(schema.productionOrders.id, id) });
  if (!order) return { ok: false, error: "Заказ не найден" };
  const qty = p.qty !== undefined ? Math.max(0, Number(p.qty) || 0) : order.qty;
  const defects = p.defects !== undefined ? Math.max(0, Math.floor(Number(p.defects) || 0)) : order.defects;
  await db.update(schema.productionOrders).set({
    assigneeId: p.assigneeId === undefined ? order.assigneeId : p.assigneeId || null,
    plannedAt: p.plannedAt === undefined ? order.plannedAt : p.plannedAt ? new Date(p.plannedAt).toISOString() : null,
    qty, defects,
    notes: p.notes === undefined ? order.notes : p.notes?.trim() || null,
  }).where(eq(schema.productionOrders.id, id));
  if (defects !== order.defects) await logActivity({ type: "system", title: `Заказ №${order.number}: брак ${defects} из ${qty}`, dealId: order.dealId, companyId: order.companyId, userId: user.id, meta: { productionOrderId: id } });
  revalidate(order.dealId);
  return { ok: true, message: `Заказ №${order.number} обновлён` };
}

/** Новый заказ: из сделки (бесшовная передача, пункт 26) либо вручную */
export async function createProductionOrder(p: { dealId?: string | null; title?: string; companyId?: string | null; qty?: number; plannedAt?: string | null; assigneeId?: string | null; notes?: string | null }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "production", "create")) return { ok: false, error: "Нет прав на создание заказов" };
  try {
    if (p.dealId) {
      const r = await handoffDeal(p.dealId, "production", user.id);
      if (p.assigneeId || p.plannedAt) await db.update(schema.productionOrders).set({ assigneeId: p.assigneeId || undefined, plannedAt: p.plannedAt ? new Date(p.plannedAt).toISOString() : undefined }).where(eq(schema.productionOrders.id, r.id));
      revalidate(p.dealId);
      return { ok: true, message: `Заказ №${r.number} создан из сделки`, id: r.id };
    }
    if (!p.title?.trim()) return { ok: false, error: "Укажите название заказа" };
    const stages = await productionStages();
    const n = await nextNumber("production");
    const id = newId("prd");
    await db.insert(schema.productionOrders).values({ id, number: n, dealId: null, companyId: p.companyId || null, title: p.title.trim(), stageId: stages[0]?.id ?? null, assigneeId: p.assigneeId || null, qty: Math.max(1, Number(p.qty) || 1), plannedAt: p.plannedAt ? new Date(p.plannedAt).toISOString() : null, status: "queued", notes: p.notes?.trim() || null });
    if (p.companyId) await logActivity({ type: "system", title: `Создан заказ в производство №${n}`, body: p.title.trim(), companyId: p.companyId, userId: user.id, meta: { productionOrderId: id } });
    revalidate();
    return { ok: true, message: `Заказ №${n} создан`, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
