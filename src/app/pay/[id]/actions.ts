"use server";
import { revalidatePath } from "next/cache";
import { eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";
import { newId } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";

/** Ссылка по id либо по «демо»-адресу вида /pay/demo-1008 (из сида) */
export async function findPaymentLink(id: string) {
  const byId = await db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, id) });
  if (byId) return byId;
  return db.query.paymentLinks.findFirst({ where: ilike(schema.paymentLinks.url, `%/pay/${id}`) });
}

/** Демо-оплата по ссылке Payme/Click (в бою это вебхук банка): платёж → баланс → счёт оплачен → событие payment.received */
export async function markPaymentLinkPaid(id: string): Promise<{ ok: boolean; error?: string }> {
  const link = await findPaymentLink(id);
  if (!link) return { ok: false, error: "Ссылка не найдена" };
  if (link.status !== "active") return { ok: false, error: link.status === "paid" ? "Уже оплачено" : "Ссылка недействительна" };
  if (link.expiresAt && link.expiresAt < new Date().toISOString()) {
    await db.update(schema.paymentLinks).set({ status: "expired" }).where(eq(schema.paymentLinks.id, link.id));
    return { ok: false, error: "Срок действия ссылки истёк" };
  }
  const paidAt = new Date().toISOString();
  const paymentId = newId("pmt");
  await db.update(schema.paymentLinks).set({ status: "paid", paidAt }).where(eq(schema.paymentLinks.id, link.id));
  await db.insert(schema.payments).values({ id: paymentId, companyId: link.companyId, dealId: link.dealId, documentId: link.documentId, paymentLinkId: link.id, amount: link.amount, direction: "in", method: "sbp", purpose: link.purpose, externalId: link.externalId ?? `sbp-${link.id}`, paidAt });
  if (link.companyId) {
    const c = await db.query.companies.findFirst({ where: eq(schema.companies.id, link.companyId) });
    if (c) await db.update(schema.companies).set({ balance: Math.round(((c.balance ?? 0) + link.amount) * 100) / 100, updatedAt: paidAt }).where(eq(schema.companies.id, c.id));
  }
  if (link.documentId) await db.update(schema.documents).set({ status: "paid" }).where(eq(schema.documents.id, link.documentId));
  await logActivity({ type: "payment", title: `Оплата ${fmtMoney(link.amount)} через Payme/Click`, body: link.purpose, dealId: link.dealId, companyId: link.companyId, meta: { paymentId, paymentLinkId: link.id, documentId: link.documentId } });
  await emit("payment.received", { paymentId, dealId: link.dealId, companyId: link.companyId, documentId: link.documentId, amount: link.amount });
  revalidatePath(`/pay/${id}`);
  revalidatePath("/finance");
  revalidatePath("/documents");
  if (link.dealId) revalidatePath(`/deals/${link.dealId}`);
  if (link.companyId) revalidatePath(`/companies/${link.companyId}`);
  return { ok: true };
}
