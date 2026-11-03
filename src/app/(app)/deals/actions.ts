"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, canRecord, hiddenFields, readonlyFields } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { nextNumber } from "@/lib/counters";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";
import { pickManager } from "@/lib/distribution";
import { handoffDeal } from "@/lib/handoff";
import { createDocument, sendDocument } from "@/lib/documents/service";
import { createPaymentLink } from "@/lib/integrations/sbp";
import { sendMessage } from "@/lib/integrations/messaging";
import { placeCall } from "@/lib/integrations/telephony";
import { fmtMoney } from "@/lib/format";
import type { DocumentType } from "@/db/schema";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Сделка + команда владельца — для проверки прав по записи */
async function loadDeal(dealId: string) {
  const row = await db
    .select({ deal: schema.deals, ownerTeamId: schema.users.teamId })
    .from(schema.deals)
    .leftJoin(schema.users, eq(schema.deals.managerId, schema.users.id))
    .where(eq(schema.deals.id, dealId))
    .then((r) => r[0]);
  return row ?? null;
}

async function editableDeal(user: SessionUser, dealId: string) {
  if (!can(user.actor, "deals", "edit")) throw new Error("Нет прав на изменение сделок");
  const row = await loadDeal(dealId);
  if (!row) throw new Error("Сделка не найдена");
  if (!canRecord(user.actor, "deals", "edit", { ownerId: row.deal.managerId, ownerTeamId: row.ownerTeamId })) throw new Error("Эта сделка принадлежит другому менеджеру");
  return row.deal;
}

async function viewableDeal(user: SessionUser, dealId: string) {
  if (!can(user.actor, "deals", "view")) throw new Error("Нет доступа к сделкам");
  const row = await loadDeal(dealId);
  if (!row) throw new Error("Сделка не найдена");
  if (!canRecord(user.actor, "deals", "view", { ownerId: row.deal.managerId, ownerTeamId: row.ownerTeamId })) throw new Error("Нет доступа к этой сделке");
  return row.deal;
}

function revalidateDeal(dealId: string, companyId?: string | null) {
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

// ───────────────────────────── Создание и этапы ─────────────────────────────

export type NewDealInput = {
  title: string;
  companyId?: string | null;
  newCompanyName?: string | null;
  amount?: number;
  pipelineId: string;
  stageId?: string | null;
  managerId?: string | null;
  source?: string | null;
  contactId?: string | null;
};

export async function createDeal(input: NewDealInput): Promise<{ ok: true; id: string; number: number } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "deals", "create")) return fail("Нет прав на создание сделок");
  try {
    const title = input.title.trim();
    if (!title) return fail("Укажите название сделки");
    const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.id, input.pipelineId) });
    if (!pipeline) return fail("Воронка не найдена");
    const stages = await db.query.stages.findMany({ where: eq(schema.stages.pipelineId, pipeline.id), orderBy: asc(schema.stages.order) });
    const stage = (input.stageId && stages.find((s) => s.id === input.stageId)) || stages[0];
    if (!stage) return fail("В воронке нет этапов");

    let companyId = input.companyId ?? null;
    if (!companyId && input.newCompanyName?.trim()) {
      const name = input.newCompanyName.trim();
      const existing = await db.query.companies.findFirst({ where: ilike(schema.companies.name, name) });
      if (existing) companyId = existing.id;
      else {
        if (!can(user.actor, "companies", "create")) return fail("Нет прав на создание клиентов");
        companyId = newId("cmp");
        const managerId = input.managerId ?? (await pickManager({ source: input.source })) ?? user.id;
        await db.insert(schema.companies).values({ id: companyId, name, status: "lead", source: input.source ?? null, managerId });
        await logActivity({ type: "system", title: `Клиент создан из сделки «${title}»`, companyId, userId: user.id });
      }
    }
    const company = companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) }) : null;
    const source = input.source?.trim() || company?.source || null;
    const managerId = input.managerId || (await pickManager({ source, tags: company?.tags ?? null })) || user.id;
    const contactId = input.contactId ?? (companyId ? (await db.query.contacts.findFirst({ where: and(eq(schema.contacts.companyId, companyId), eq(schema.contacts.isPrimary, true)) }))?.id ?? null : null);

    const number = await nextNumber("deal");
    const id = newId("deal");
    const amount = Math.max(0, Number(input.amount) || 0);
    await db.insert(schema.deals).values({ id, number, title, companyId, contactId, pipelineId: pipeline.id, stageId: stage.id, amount, managerId, status: stage.kind, source, utm: company?.utm ?? null, closedAt: stage.kind === "open" ? null : new Date().toISOString() });
    await logActivity({ type: "system", title: `Сделка №${number} создана`, body: source ? `Источник: ${source}` : null, dealId: id, companyId, userId: user.id, meta: { stageId: stage.id } });
    const payload = { dealId: id, companyId, contactId, userId: user.id, amount, source, toStage: stage.name, pipelineKind: pipeline.kind };
    await emit("deal.created", payload);
    if (pipeline.kind === "sales" && stage.id === stages[0].id) await emit("lead.created", payload);
    revalidatePath("/deals");
    if (companyId) revalidatePath(`/companies/${companyId}`);
    return { ok: true, id, number };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function moveDealStage(dealId: string, stageId: string): Promise<{ ok: true; status: "open" | "won" | "lost" } | Fail> {
  const user = await requireUser();
  try {
    const deal = await editableDeal(user, dealId);
    if (readonlyFields(user.actor, "deals").includes("stageId")) return fail("Смена этапа недоступна для вашей роли");
    if (deal.stageId === stageId) return { ok: true, status: deal.status };
    const [from, to] = await Promise.all([db.query.stages.findFirst({ where: eq(schema.stages.id, deal.stageId) }), db.query.stages.findFirst({ where: eq(schema.stages.id, stageId) })]);
    if (!to || to.pipelineId !== deal.pipelineId) return fail("Этап не принадлежит этой воронке");
    const now = new Date().toISOString();
    const status = to.kind;
    await db.update(schema.deals).set({ stageId, stageEnteredAt: now, updatedAt: now, status, closedAt: status === "open" ? null : now }).where(eq(schema.deals.id, dealId));
    await logActivity({ type: "stage", title: `Этап: ${from?.name ?? "—"} → ${to.name}`, dealId, companyId: deal.companyId, contactId: deal.contactId, userId: user.id, meta: { fromStageId: deal.stageId, toStageId: stageId } });
    const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.id, deal.pipelineId) });
    const payload = { dealId, companyId: deal.companyId, contactId: deal.contactId, fromStage: from?.name ?? null, toStage: to.name, userId: user.id, amount: deal.amount, pipelineKind: pipeline?.kind ?? null, source: deal.source };
    await emit("deal.stage_changed", payload);
    if (status === "won") await emit("deal.won", payload);
    if (status === "lost") await emit("deal.lost", payload);
    revalidateDeal(dealId, deal.companyId);
    return { ok: true, status };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Редактирование ─────────────────────────────

export type DealPatch = Partial<{
  title: string;
  amount: number;
  companyId: string | null;
  contactId: string | null;
  managerId: string | null;
  source: string | null;
  nextStep: string | null;
  expectedCloseAt: string | null;
  lostReason: string | null;
  ymClientId: string | null;
  utm: { source?: string; medium?: string; campaign?: string; content?: string; term?: string } | null;
}>;

export async function updateDeal(dealId: string, patch: DealPatch): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const deal = await editableDeal(user, dealId);
    const ro = readonlyFields(user.actor, "deals");
    const hidden = hiddenFields(user.actor, "deals");
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (ro.includes(k) || hidden.includes(k)) return fail(`Поле «${k}» недоступно для изменения`);
      set[k] = v;
    }
    if (typeof set.title === "string") {
      set.title = set.title.trim();
      if (!set.title) return fail("Название не может быть пустым");
    }
    if (set.amount !== undefined) set.amount = Math.max(0, Number(set.amount) || 0);
    if (!Object.keys(set).length) return { ok: true };
    set.updatedAt = new Date().toISOString();
    await db.update(schema.deals).set(set).where(eq(schema.deals.id, dealId));
    const labels: Record<string, string> = { title: "название", amount: "сумма", companyId: "клиент", contactId: "контакт", managerId: "менеджер", source: "источник", nextStep: "следующий шаг", expectedCloseAt: "дата закрытия", lostReason: "причина отказа", ymClientId: "ym_client_id", utm: "UTM" };
    const changed = Object.keys(set).filter((k) => k !== "updatedAt").map((k) => labels[k] ?? k);
    await logActivity({ type: "system", title: `Изменено: ${changed.join(", ")}`, dealId, companyId: deal.companyId, userId: user.id, meta: set });
    revalidateDeal(dealId, deal.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Позиции ─────────────────────────────

async function recalcAmount(dealId: string) {
  const items = await db.query.dealItems.findMany({ where: eq(schema.dealItems.dealId, dealId) });
  const amount = Math.round(items.reduce((s, i) => s + i.qty * i.price * (1 - i.discount / 100), 0) * 100) / 100;
  await db.update(schema.deals).set({ amount, updatedAt: new Date().toISOString() }).where(eq(schema.deals.id, dealId));
  return amount;
}

export type DealItemInput = { productId?: string | null; name: string; unit?: string; qty: number; price: number; discount?: number; vatRate?: number };

export async function addDealItem(dealId: string, input: DealItemInput): Promise<{ ok: true; amount: number } | Fail> {
  const user = await requireUser();
  try {
    const deal = await editableDeal(user, dealId);
    let { name, unit, price, vatRate } = input;
    if (input.productId) {
      const p = await db.query.products.findFirst({ where: eq(schema.products.id, input.productId) });
      if (!p) return fail("Товар не найден");
      name = name?.trim() || p.name;
      unit = unit ?? p.unit;
      price = Number.isFinite(price) ? price : p.price;
      vatRate = vatRate ?? p.vatRate;
    }
    name = (name ?? "").trim();
    if (!name) return fail("Укажите наименование позиции");
    const qty = Math.max(0.001, Number(input.qty) || 1);
    await db.insert(schema.dealItems).values({ id: newId("itm"), dealId, productId: input.productId ?? null, name, unit: unit || "шт", qty, price: Math.max(0, Number(price) || 0), discount: Math.min(100, Math.max(0, Number(input.discount) || 0)), vatRate: vatRate ?? 20 });
    const amount = await recalcAmount(dealId);
    await logActivity({ type: "system", title: `Добавлена позиция: ${name} × ${qty}`, dealId, companyId: deal.companyId, userId: user.id });
    revalidateDeal(dealId, deal.companyId);
    return { ok: true, amount };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function updateDealItem(itemId: string, patch: Partial<Pick<DealItemInput, "qty" | "price" | "discount" | "name">>): Promise<{ ok: true; amount: number } | Fail> {
  const user = await requireUser();
  try {
    const item = await db.query.dealItems.findFirst({ where: eq(schema.dealItems.id, itemId) });
    if (!item) return fail("Позиция не найдена");
    const deal = await editableDeal(user, item.dealId);
    const set: Partial<typeof schema.dealItems.$inferInsert> = {};
    if (patch.qty !== undefined) set.qty = Math.max(0.001, Number(patch.qty) || 1);
    if (patch.price !== undefined) set.price = Math.max(0, Number(patch.price) || 0);
    if (patch.discount !== undefined) set.discount = Math.min(100, Math.max(0, Number(patch.discount) || 0));
    if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
    if (Object.keys(set).length) await db.update(schema.dealItems).set(set).where(eq(schema.dealItems.id, itemId));
    const amount = await recalcAmount(item.dealId);
    revalidateDeal(item.dealId, deal.companyId);
    return { ok: true, amount };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function removeDealItem(itemId: string): Promise<{ ok: true; amount: number } | Fail> {
  const user = await requireUser();
  try {
    const item = await db.query.dealItems.findFirst({ where: eq(schema.dealItems.id, itemId) });
    if (!item) return fail("Позиция не найдена");
    const deal = await editableDeal(user, item.dealId);
    await db.delete(schema.dealItems).where(eq(schema.dealItems.id, itemId));
    const amount = await recalcAmount(item.dealId);
    await logActivity({ type: "system", title: `Удалена позиция: ${item.name}`, dealId: item.dealId, companyId: deal.companyId, userId: user.id });
    revalidateDeal(item.dealId, deal.companyId);
    return { ok: true, amount };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Документы и оплата ─────────────────────────────

export async function createDealDocument(dealId: string, type: Exclude<DocumentType, "report">): Promise<{ ok: true; id: string; number: string; title: string } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    if (!can(user.actor, "documents", "create")) return fail("Нет прав на создание документов");
    const r = await createDocument({ type, dealId, companyId: deal.companyId, userId: user.id });
    revalidateDeal(dealId, deal.companyId);
    revalidatePath("/documents");
    return { ok: true, id: r.id, number: r.number, title: r.title };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function sendDealDocument(documentId: string): Promise<{ ok: true; channel: string | null; sandbox: boolean } | Fail> {
  const user = await requireUser();
  try {
    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
    if (!doc) return fail("Документ не найден");
    if (!can(user.actor, "documents", "view")) return fail("Нет доступа к документам");
    if (doc.dealId) await viewableDeal(user, doc.dealId);
    const r = await sendDocument(documentId, "preferred", user.id);
    if (!r.ok) return fail(r.error ?? "Не удалось отправить документ");
    if (doc.dealId) revalidateDeal(doc.dealId, doc.companyId);
    else if (doc.companyId) revalidatePath(`/companies/${doc.companyId}`);
    revalidatePath("/documents");
    return { ok: true, channel: r.channel, sandbox: r.sandbox };
  } catch (e) {
    return fail(msg(e));
  }
}

/** 21. Ссылка на оплату по СБП: создаём и сразу отправляем клиенту в предпочтительный канал */
export async function sendPaymentLink(dealId: string, documentId?: string | null): Promise<{ ok: true; url: string; sent: boolean; channel: string | null; sandbox: boolean } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    const doc = documentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) }) : null;
    const amount = doc?.amount || deal.amount;
    if (!amount) return fail("Сумма сделки нулевая — добавьте позиции");
    const purpose = doc ? `Оплата по ${doc.title}` : `Оплата по сделке №${deal.number}`;
    const link = await createPaymentLink({ amount, purpose, dealId, documentId: doc?.id ?? null, companyId: deal.companyId });
    const text = `${purpose} на сумму ${fmtMoney(amount)}. Оплатить по СБП: ${link.url}`;
    const r = await sendMessage({ channel: "preferred", text, companyId: deal.companyId, contactId: deal.contactId, dealId, userId: user.id });
    await logActivity({ type: "payment", title: r.ok ? `Ссылка на оплату отправлена (${r.channel})` : "Ссылка на оплату создана", body: `${fmtMoney(amount)} · ${link.url}`, dealId, companyId: deal.companyId, userId: user.id, meta: { paymentLinkId: link.id, documentId: doc?.id ?? null } });
    revalidateDeal(dealId, deal.companyId);
    return { ok: true, url: link.url, sent: r.ok, channel: r.channel, sandbox: link.sandbox || r.sandbox };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Передача дальше ─────────────────────────────

export async function handoff(dealId: string, kind: "shipping" | "service" | "production"): Promise<{ ok: true; id: string; number: number; kind: string } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    if (!can(user.actor, "deals", "create") && kind !== "production") return fail("Нет прав на создание сделок");
    const r = await handoffDeal(dealId, kind, user.id);
    revalidateDeal(dealId, deal.companyId);
    if (kind !== "production") revalidatePath(`/deals/${r.id}`);
    else revalidatePath("/production");
    return { ok: true, ...r };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Задачи, заметки, связь ─────────────────────────────

export async function addDealTask(dealId: string, title: string, dueAt?: string | null): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    if (!can(user.actor, "tasks", "create")) return fail("Нет прав на создание задач");
    const t = title.trim();
    if (!t) return fail("Введите текст задачи");
    const id = newId("task");
    await db.insert(schema.tasks).values({ id, title: t, assigneeId: deal.managerId ?? user.id, creatorId: user.id, dealId, companyId: deal.companyId, dueAt: dueAt || null, source: "manual" });
    await logActivity({ type: "task", title: `Задача: ${t}`, dealId, companyId: deal.companyId, userId: user.id, meta: { taskId: id } });
    revalidateDeal(dealId, deal.companyId);
    revalidatePath("/tasks");
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function toggleDealTask(taskId: string): Promise<{ ok: true; status: "open" | "done" } | Fail> {
  const user = await requireUser();
  try {
    const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
    if (!task) return fail("Задача не найдена");
    if (!can(user.actor, "tasks", "edit") || !canRecord(user.actor, "tasks", "edit", { ownerId: task.assigneeId })) return fail("Нет прав на изменение задачи");
    const status = task.status === "done" ? "open" : "done";
    await db.update(schema.tasks).set({ status, completedAt: status === "done" ? new Date().toISOString() : null }).where(eq(schema.tasks.id, taskId));
    if (task.dealId) revalidateDeal(task.dealId, task.companyId);
    revalidatePath("/tasks");
    return { ok: true, status };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function addDealNote(dealId: string, text: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    const t = text.trim();
    if (!t) return fail("Пустая заметка");
    await logActivity({ type: "note", title: "Заметка", body: t, dealId, companyId: deal.companyId, contactId: deal.contactId, userId: user.id });
    revalidateDeal(dealId, deal.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function callDeal(dealId: string): Promise<{ ok: true; sandbox: boolean; phone: string } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    const contact = deal.contactId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.id, deal.contactId) }) : null;
    const company = deal.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, deal.companyId) }) : null;
    const phone = contact?.phone ?? company?.phone;
    if (!phone) return fail("У клиента не указан телефон");
    const r = await placeCall({ phone, userId: user.id, contactId: contact?.id, companyId: deal.companyId, dealId });
    revalidateDeal(dealId, deal.companyId);
    revalidatePath("/calls");
    return { ok: true, sandbox: r.sandbox, phone };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function messageDeal(dealId: string, text: string): Promise<{ ok: true; channel: string | null; sandbox: boolean; conversationId: string | null } | Fail> {
  const user = await requireUser();
  try {
    const deal = await viewableDeal(user, dealId);
    const t = text.trim();
    if (!t) return fail("Введите текст сообщения");
    const r = await sendMessage({ channel: "preferred", text: t, companyId: deal.companyId, contactId: deal.contactId, dealId, userId: user.id });
    if (!r.ok) return fail(r.error ?? "Не удалось отправить");
    await logActivity({ type: "message", title: `Сообщение клиенту (${r.channel})`, body: t, dealId, companyId: deal.companyId, contactId: deal.contactId, userId: user.id, meta: { conversationId: r.conversationId } });
    revalidateDeal(dealId, deal.companyId);
    revalidatePath("/inbox");
    return { ok: true, channel: r.channel, sandbox: r.sandbox, conversationId: r.conversationId };
  } catch (e) {
    return fail(msg(e));
  }
}
