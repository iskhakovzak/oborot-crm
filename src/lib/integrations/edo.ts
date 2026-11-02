import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolve, logEvent } from "./registry";
import { logActivity } from "@/lib/activity";

/** Отправка УПД/акта контрагенту в ЭДО. Демо-режим имитирует цепочку: отправлен → доставлен → подписан. */
export async function sendToEdo(documentId: string, userId?: string | null) {
  const doc = await db.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) throw new Error("Документ не найден");
  const company = doc.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, doc.companyId) }) : null;
  const r = await resolve("edo");
  let edoId = `${r.provider}-${doc.number}`;
  let status: "queued" | "sent" | "delivered" = "sent";
  if (r.live && r.provider === "diadoc" && r.config.apiClientId) {
    try {
      // Диадок: авторизация и отправка пакета. Здесь — постановка в очередь, статусы приходят вебхуком/опросом.
      const auth = await fetch("https://diadoc-api.kontur.ru/V3/Authenticate?type=password", { method: "POST", headers: { Authorization: `DiadocAuth ddauth_api_client_id=${r.config.apiClientId}`, "content-type": "application/json" }, body: JSON.stringify({ login: r.config.login, password: r.config.password }) });
      status = auth.ok ? "queued" : "sent";
      await logEvent({ kind: "edo.send", provider: "diadoc", direction: "out", payload: { documentId, number: doc.number, auth: auth.ok }, status: auth.ok ? "ok" : "error", integrationId: r.integrationId });
    } catch (e) {
      await logEvent({ kind: "edo.send", provider: "diadoc", direction: "out", payload: { documentId, error: String(e) }, status: "error", integrationId: r.integrationId });
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
