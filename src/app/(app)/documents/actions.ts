"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DocumentType } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createDocument, sendDocument, createClientReport } from "@/lib/documents/service";
import { sendToEdo, updateEdoStatus } from "@/lib/integrations/edo";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";
import { newId } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";

type Result = { ok: true; message: string; id?: string } | { ok: false; error: string };

function revalidateDoc(id: string, dealId?: string | null, companyId?: string | null) {
  revalidatePath("/documents");
  revalidatePath(`/documents/${id}`);
  revalidatePath("/finance");
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

/** 6/7/8 — документ по сделке в один клик */
export async function createDocumentAction(p: { type: DocumentType; dealId: string }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "create")) return { ok: false, error: "Нет прав на создание документов" };
  if (p.type === "report") return { ok: false, error: "Отчёт формируется по клиенту" };
  try {
    const r = await createDocument({ type: p.type, dealId: p.dealId, userId: user.id });
    revalidateDoc(r.id, p.dealId);
    return { ok: true, message: `${r.title} сформирован на ${fmtMoney(r.amount)}`, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 22 — отчёт для клиента */
export async function createReportAction(p: { companyId: string; months?: number }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "create")) return { ok: false, error: "Нет прав на создание документов" };
  try {
    const r = await createClientReport(p.companyId, { months: p.months ?? 3, userId: user.id });
    revalidateDoc(r.id, null, p.companyId);
    return { ok: true, message: `Отчёт ${r.number} сформирован${r.aiSandbox ? " (резюме без ИИ — демо)" : ""}`, id: r.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 21 — отправка документа клиенту в предпочтительный канал */
export async function sendDocumentAction(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "edit")) return { ok: false, error: "Нет прав" };
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) return { ok: false, error: "Документ не найден" };
  const r = await sendDocument(id, "preferred", user.id);
  revalidateDoc(id, doc.dealId, doc.companyId);
  if (!r.ok) return { ok: false, error: r.error ?? "Не удалось отправить" };
  const ch = r.channel ? { telegram: "Telegram", whatsapp: "WhatsApp", vk: "ВКонтакте", max: "MAX", email: "email", sms: "SMS", web: "чат" }[r.channel] : "клиенту";
  return { ok: true, message: `${doc.title} отправлен через ${ch}${r.sandbox ? " (демо-режим)" : ""}` };
}

/** 9 — отправка в ЭДО */
export async function sendToEdoAction(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "edit")) return { ok: false, error: "Нет прав" };
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) return { ok: false, error: "Документ не найден" };
  if (!["upd", "act", "contract"].includes(doc.type)) return { ok: false, error: "В ЭДО отправляются УПД, акты и договоры" };
  try {
    const r = await sendToEdo(id, user.id);
    revalidateDoc(id, doc.dealId, doc.companyId);
    return { ok: true, message: `${doc.title} отправлен в ЭДО, ID ${r.edoId}${r.sandbox ? " (демо-режим)" : ""}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Демо-кнопки статусов ЭДО (в бою приходят вебхуком провайдера) */
export async function updateEdoStatusAction(id: string, status: "delivered" | "signed" | "rejected"): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "edit")) return { ok: false, error: "Нет прав" };
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) return { ok: false, error: "Документ не найден" };
  if (doc.edoStatus === "none") return { ok: false, error: "Документ ещё не отправлен в ЭДО" };
  await updateEdoStatus(id, status, user.id);
  revalidateDoc(id, doc.dealId, doc.companyId);
  return { ok: true, message: status === "signed" ? "Контрагент подписал документ" : status === "delivered" ? "Документ доставлен контрагенту" : "Контрагент отклонил документ" };
}

/** Ручная отметка оплаты счёта: платёж + баланс + событие payment.received */
export async function markPaidAction(id: string, method: "bank" | "sbp" = "bank"): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "edit") || !can(user.actor, "payments", "create")) return { ok: false, error: "Нет прав на проведение оплат" };
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) return { ok: false, error: "Документ не найден" };
  if (doc.type !== "invoice") return { ok: false, error: "Оплачиваются только счета" };
  if (doc.status === "paid") return { ok: false, error: "Счёт уже оплачен" };
  if (doc.status === "cancelled") return { ok: false, error: "Счёт отменён" };
  const paymentId = newId("pmt");
  await db.insert(schema.payments).values({ id: paymentId, companyId: doc.companyId, dealId: doc.dealId, documentId: doc.id, amount: doc.amount, direction: "in", method, purpose: `Оплата по счёту ${doc.number}` });
  if (doc.companyId) {
    const company = await db.query.companies.findFirst({ where: eq(schema.companies.id, doc.companyId) });
    if (company) await db.update(schema.companies).set({ balance: Math.round(((company.balance ?? 0) + doc.amount) * 100) / 100, updatedAt: new Date().toISOString() }).where(eq(schema.companies.id, company.id));
  }
  await db.update(schema.documents).set({ status: "paid" }).where(eq(schema.documents.id, id));
  await logActivity({ type: "payment", title: `Оплата ${fmtMoney(doc.amount)} по счёту ${doc.number}`, body: method === "sbp" ? "Способ: СБП" : "Способ: банковский перевод", dealId: doc.dealId, companyId: doc.companyId, userId: user.id, meta: { documentId: id, paymentId } });
  await emit("payment.received", { paymentId, dealId: doc.dealId, companyId: doc.companyId, documentId: id, amount: doc.amount, userId: user.id });
  revalidateDoc(id, doc.dealId, doc.companyId);
  return { ok: true, message: `Счёт ${doc.number} отмечен оплаченным на ${fmtMoney(doc.amount)}` };
}

export async function cancelDocumentAction(id: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "documents", "edit")) return { ok: false, error: "Нет прав" };
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) return { ok: false, error: "Документ не найден" };
  if (doc.status === "paid") return { ok: false, error: "Оплаченный счёт отменить нельзя" };
  if (doc.status === "cancelled") return { ok: false, error: "Документ уже отменён" };
  await db.update(schema.documents).set({ status: "cancelled" }).where(eq(schema.documents.id, id));
  await logActivity({ type: "document", title: `Документ ${doc.number} отменён`, dealId: doc.dealId, companyId: doc.companyId, userId: user.id, meta: { documentId: id } });
  revalidateDoc(id, doc.dealId, doc.companyId);
  return { ok: true, message: `Документ ${doc.number} отменён` };
}
