"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fetchStatement, reconcile } from "@/lib/integrations/bank";
import { createPaymentLink } from "@/lib/integrations/sbp";
import { syncAllPayments } from "@/lib/integrations/finance";
import { sendMessage } from "@/lib/integrations/messaging";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";
import { newId } from "@/lib/utils";
import { fmtMoney, plural } from "@/lib/format";

type Result = { ok: true; message: string; id?: string } | { ok: false; error: string };

function revalidateFinance(dealId?: string | null, companyId?: string | null, documentId?: string | null) {
  revalidatePath("/finance");
  revalidatePath("/documents");
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

/** Общий сценарий проведения входящей оплаты: платёж → баланс → счёт оплачен → событие */
async function registerPayment(p: { companyId: string | null; dealId: string | null; documentId: string | null; amount: number; method: "sbp" | "bank" | "cash" | "card"; purpose: string; userId: string; externalId?: string | null; paymentLinkId?: string | null; paidAt?: string }) {
  const paymentId = newId("pmt");
  await db.insert(schema.payments).values({ id: paymentId, companyId: p.companyId, dealId: p.dealId, documentId: p.documentId, paymentLinkId: p.paymentLinkId ?? null, amount: p.amount, direction: "in", method: p.method, purpose: p.purpose, externalId: p.externalId ?? null, paidAt: p.paidAt ?? new Date().toISOString() });
  if (p.companyId) {
    const c = await db.query.companies.findFirst({ where: eq(schema.companies.id, p.companyId) });
    if (c) await db.update(schema.companies).set({ balance: Math.round(((c.balance ?? 0) + p.amount) * 100) / 100, updatedAt: new Date().toISOString() }).where(eq(schema.companies.id, c.id));
  }
  if (p.documentId) await db.update(schema.documents).set({ status: "paid" }).where(eq(schema.documents.id, p.documentId));
  await logActivity({ type: "payment", title: `Оплата ${fmtMoney(p.amount)}`, body: p.purpose, dealId: p.dealId, companyId: p.companyId, userId: p.userId, meta: { paymentId, documentId: p.documentId } });
  await emit("payment.received", { paymentId, dealId: p.dealId, companyId: p.companyId, documentId: p.documentId, amount: p.amount, userId: p.userId });
  return paymentId;
}

export async function addPaymentAction(p: { companyId: string; dealId?: string | null; documentId?: string | null; amount: number; method: "sbp" | "bank" | "cash" | "card"; purpose: string }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "create")) return { ok: false, error: "Нет прав на проведение оплат" };
  if (!p.companyId) return { ok: false, error: "Выберите клиента" };
  if (!(p.amount > 0)) return { ok: false, error: "Сумма должна быть больше нуля" };
  const doc = p.documentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, p.documentId) }) : null;
  const id = await registerPayment({ companyId: p.companyId, dealId: p.dealId || doc?.dealId || null, documentId: doc?.id ?? null, amount: p.amount, method: p.method, purpose: p.purpose || (doc ? `Оплата по счёту ${doc.number}` : "Оплата"), userId: user.id });
  revalidateFinance(p.dealId, p.companyId, doc?.id);
  return { ok: true, message: `Оплата ${fmtMoney(p.amount)} проведена`, id };
}

/** 11 — выписка банка и авторазноска */
export async function loadStatementAction(): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "create")) return { ok: false, error: "Нет прав" };
  try {
    const st = await fetchStatement();
    const r = await reconcile(st.rows, user.id);
    await db.update(schema.integrations).set({ lastSyncAt: new Date().toISOString() }).where(eq(schema.integrations.kind, "bank"));
    revalidateFinance();
    return { ok: true, message: `Загружено ${plural(r.created, "операция", "операции", "операций")}, разнесено ${r.matched}${st.sandbox ? " (демо-выписка)" : ""}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Ручная привязка операции выписки к клиенту и счёту */
export async function linkTransactionAction(p: { txId: string; companyId: string; documentId?: string | null }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "create")) return { ok: false, error: "Нет прав" };
  const tx = await db.query.bankTransactions.findFirst({ where: eq(schema.bankTransactions.id, p.txId) });
  if (!tx) return { ok: false, error: "Операция не найдена" };
  if (tx.matchedPaymentId) return { ok: false, error: "Операция уже разнесена" };
  if (!p.companyId) return { ok: false, error: "Выберите клиента" };
  const doc = p.documentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, p.documentId) }) : null;
  let paymentId: string | null = null;
  if (tx.direction === "in") {
    paymentId = await registerPayment({ companyId: p.companyId, dealId: doc?.dealId ?? null, documentId: doc?.id ?? null, amount: tx.amount, method: "bank", purpose: tx.purpose ?? "Оплата по выписке", userId: user.id, externalId: tx.externalId, paidAt: tx.date });
  }
  await db.update(schema.bankTransactions).set({ matchedCompanyId: p.companyId, matchedDocumentId: doc?.id ?? null, matchedPaymentId: paymentId }).where(eq(schema.bankTransactions.id, tx.id));
  revalidateFinance(doc?.dealId, p.companyId, doc?.id);
  return { ok: true, message: tx.direction === "in" ? `Операция разнесена: создан платёж ${fmtMoney(tx.amount)}` : "Операция привязана к контрагенту" };
}

/** 10 — ссылка на оплату по СБП */
export async function createPaymentLinkAction(p: { companyId?: string | null; dealId?: string | null; documentId?: string | null; amount: number; purpose: string }): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "create")) return { ok: false, error: "Нет прав" };
  if (!(p.amount > 0)) return { ok: false, error: "Сумма должна быть больше нуля" };
  const doc = p.documentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, p.documentId) }) : null;
  const r = await createPaymentLink({ amount: p.amount, purpose: p.purpose || (doc ? `Оплата по счёту ${doc.number}` : "Оплата"), companyId: p.companyId || doc?.companyId || null, dealId: p.dealId || doc?.dealId || null, documentId: doc?.id ?? null });
  await logActivity({ type: "payment", title: `Создана ссылка на оплату по СБП на ${fmtMoney(p.amount)}`, body: r.url, dealId: p.dealId || doc?.dealId || null, companyId: p.companyId || doc?.companyId || null, userId: user.id, meta: { paymentLinkId: r.id, documentId: doc?.id ?? null } });
  revalidateFinance(p.dealId, p.companyId);
  return { ok: true, message: `Ссылка создана${r.sandbox ? " (демо-режим СБП)" : ""}`, id: r.id };
}

export async function sendPaymentLinkAction(linkId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "view")) return { ok: false, error: "Нет прав" };
  const link = await db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, linkId) });
  if (!link) return { ok: false, error: "Ссылка не найдена" };
  const deal = link.dealId ? await db.query.deals.findFirst({ where: eq(schema.deals.id, link.dealId) }) : null;
  const r = await sendMessage({ channel: "preferred", text: `Ссылка на оплату ${fmtMoney(link.amount)} по СБП: ${link.url}\n${link.purpose}`, companyId: link.companyId, contactId: deal?.contactId, dealId: link.dealId, userId: user.id });
  if (!r.ok) return { ok: false, error: r.error ?? "Не удалось отправить" };
  await logActivity({ type: "message", title: `Ссылка на оплату отправлена клиенту (${r.channel})`, dealId: link.dealId, companyId: link.companyId, userId: user.id, meta: { paymentLinkId: link.id } });
  revalidateFinance(link.dealId, link.companyId);
  return { ok: true, message: `Ссылка отправлена через ${r.channel}${r.sandbox ? " (демо-режим)" : ""}` };
}

export async function cancelPaymentLinkAction(linkId: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "edit")) return { ok: false, error: "Нет прав" };
  const link = await db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, linkId) });
  if (!link) return { ok: false, error: "Ссылка не найдена" };
  if (link.status !== "active") return { ok: false, error: "Отменить можно только активную ссылку" };
  await db.update(schema.paymentLinks).set({ status: "cancelled" }).where(eq(schema.paymentLinks.id, linkId));
  revalidateFinance(link.dealId, link.companyId);
  return { ok: true, message: "Ссылка отменена" };
}

/** 12 — синхронизация оплат с финучётом */
export async function syncFinanceAction(): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "payments", "edit")) return { ok: false, error: "Нет прав" };
  const n = await syncAllPayments();
  revalidateFinance();
  return { ok: true, message: n ? `Синхронизировано ${plural(n, "оплата", "оплаты", "оплат")}` : "Все оплаты уже синхронизированы" };
}
