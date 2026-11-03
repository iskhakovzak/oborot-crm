import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolve, logEvent } from "./registry";
import { logActivity } from "@/lib/activity";

/** Отправка ЭСФ/акта контрагенту в ЭДО (Didox / Faktura.uz). Демо-режим имитирует цепочку: отправлен → доставлен → подписан. */
export async function sendToEdo(documentId: string, userId?: string | null) {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) throw new Error("Документ не найден");
  const company = doc.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, doc.companyId) }) : null;
  const r = await resolve("edo");
  let edoId = `${r.provider}-${doc.number}`;
  let status: "queued" | "sent" | "delivered" = "sent";
  if (r.live && r.provider === "didox" && r.config.token) {
    try {
      // Didox (api.didox.uz): создаём черновик документа и отправляем контрагенту по ИНН; статусы приходят вебхуком/опросом.
      const res = await fetch("https://api.didox.uz/v1/documents", { method: "POST", headers: { "user-key": r.config.token, "content-type": "application/json", accept: "application/json" } , body: JSON.stringify({ doctype: doc.type === "act" ? "act" : "factura", number: doc.number, date: doc.createdAt.slice(0, 10), buyerTin: company?.inn ?? "", amount: doc.amount, currency: "UZS" }) });
      const j = (await res.json().catch(() => ({}))) as { data?: { id?: string; doc_id?: string }; id?: string; message?: string };
      const remoteId = j.data?.id ?? j.data?.doc_id ?? j.id;
      if (res.ok && remoteId) edoId = String(remoteId);
      status = res.ok ? "queued" : "sent";
      await logEvent({ kind: "edo.send", provider: "didox", direction: "out", payload: { documentId, number: doc.number, ok: res.ok, response: j }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
    } catch (e) {
      await logEvent({ kind: "edo.send", provider: "didox", direction: "out", payload: { documentId, error: String(e) }, status: "error", integrationId: r.integrationId });
    }
  } else if (r.live && r.provider === "faktura" && r.config.login) {
    try {
      const res = await fetch("https://api.faktura.uz/v1/documents", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${r.config.login}:${r.config.password}`).toString("base64"), "content-type": "application/json" }, body: JSON.stringify({ type: doc.type, number: doc.number, buyerTin: company?.inn ?? "", amount: doc.amount }) });
      status = res.ok ? "queued" : "sent";
      await logEvent({ kind: "edo.send", provider: "faktura", direction: "out", payload: { documentId, number: doc.number, ok: res.ok }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
    } catch (e) {
      await logEvent({ kind: "edo.send", provider: "faktura", direction: "out", payload: { documentId, error: String(e) }, status: "error", integrationId: r.integrationId });
    }
  } else {
    edoId = `demo-${doc.number}`;
    await logEvent({ kind: "edo.send", provider: r.provider, direction: "out", payload: { documentId, number: doc.number, counterparty: company?.name, inn: company?.inn }, status: "sandbox", integrationId: r.integrationId });
  }
  await db.update(schema.documents).set({ edoProvider: r.provider, edoId, edoStatus: status, sentAt: new Date().toISOString(), status: doc.status === "draft" ? "sent" : doc.status }).where(eq(schema.documents.id, documentId));
  await logActivity({ type: "document", title: `${doc.title} отправлен в ЭДО (${r.name})`, body: company ? `Получатель: ${company.name}` : null, dealId: doc.dealId, companyId: doc.companyId, userId, meta: { documentId, edoId } });
  return { edoId, status, sandbox: !r.live };
}

/** Обновление статуса (вебхук провайдера или демо-кнопка «контрагент подписал») */
export async function updateEdoStatus(documentId: string, edoStatus: "delivered" | "signed" | "rejected", userId?: string | null) {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) return;
  await db.update(schema.documents).set({ edoStatus, status: edoStatus === "signed" ? "signed" : doc.status }).where(eq(schema.documents.id, documentId));
  await logActivity({ type: "document", title: edoStatus === "signed" ? `${doc.title}: подписан контрагентом в ЭДО` : edoStatus === "delivered" ? `${doc.title}: доставлен контрагенту` : `${doc.title}: отклонён контрагентом`, dealId: doc.dealId, companyId: doc.companyId, userId, meta: { documentId } });
}
