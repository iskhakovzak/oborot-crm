import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { appUrl } from "@/lib/settings";
import { resolve, logEvent } from "./registry";

/**
 * Платёжные ссылки Узбекистана (kind «sbp» сохранён в типах для совместимости).
 * Payme — ссылка на checkout.paycom.uz с base64-параметрами (m=merchant; ac.order_id=…; a=сумма в тийинах).
 * Click — ссылка на my.click.uz/services/pay с service_id, merchant_id, amount и transaction_param.
 * Uzum Bank — через API (при наличии ключа); иначе, как и без интеграций, — демо-страница оплаты внутри CRM /pay/<id>.
 * QR-код всегда кодирует ту же ссылку.
 */
export function paymeCheckoutUrl(p: { merchantId: string; amount: number; orderId: string; purpose?: string }) {
  const params = `m=${p.merchantId};ac.order_id=${p.orderId};a=${Math.round(p.amount * 100)}${p.purpose ? `;c=${encodeURIComponent(p.purpose.slice(0, 120))}` : ""}`;
  return `https://checkout.paycom.uz/${Buffer.from(params, "utf8").toString("base64")}`;
}
export function clickPayUrl(p: { serviceId: string; merchantId: string; amount: number; transactionParam: string; returnUrl?: string }) {
  const q = new URLSearchParams({ service_id: p.serviceId, merchant_id: p.merchantId, amount: p.amount.toFixed(2), transaction_param: p.transactionParam });
  if (p.returnUrl) q.set("return_url", p.returnUrl);
  return `https://my.click.uz/services/pay?${q}`;
}

export async function createPaymentLink(p: { amount: number; purpose: string; dealId?: string | null; documentId?: string | null; companyId?: string | null; ttlHours?: number }) {
  const r = await resolve("sbp");
  const id = newId("pay");
  const expiresAt = new Date(Date.now() + (p.ttlHours ?? 72) * 3600_000).toISOString();
  let url = appUrl(`/pay/${id}`);
  let qrPayload = url;
  let externalId: string | null = null;
  try {
    if (r.live && r.provider === "payme" && r.config.merchantId) {
      // Payme: ссылка формируется локально, факт оплаты приходит вебхуком Merchant API (CheckPerformTransaction / PerformTransaction)
      url = paymeCheckoutUrl({ merchantId: r.config.merchantId, amount: p.amount, orderId: id, purpose: p.purpose });
      qrPayload = url;
      externalId = id;
      await logEvent({ kind: "sbp.create", provider: "payme", direction: "out", payload: { amount: p.amount, orderId: id, url }, integrationId: r.integrationId });
    } else if (r.live && r.provider === "click" && r.config.serviceId && r.config.merchantId) {
      // Click: ссылка формируется локально, оплата подтверждается вебхуками Prepare/Complete с подписью secret
      url = clickPayUrl({ serviceId: r.config.serviceId, merchantId: r.config.merchantId, amount: p.amount, transactionParam: id, returnUrl: appUrl(`/pay/${id}`) });
      qrPayload = url;
      externalId = id;
      await logEvent({ kind: "sbp.create", provider: "click", direction: "out", payload: { amount: p.amount, transactionParam: id, url }, integrationId: r.integrationId });
    } else if (r.live && r.provider === "uzum" && r.config.apiKey) {
      const res = await fetch("https://api.uzumbank.uz/api/v1/payment-link", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${r.config.apiKey}` }, body: JSON.stringify({ amount: Math.round(p.amount * 100), currency: "UZS", orderId: id, description: p.purpose.slice(0, 250), expiresAt }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; paymentUrl?: string; id?: string; paymentId?: string; message?: string };
      const link = j.url ?? j.paymentUrl;
      if (res.ok && link) { url = link; qrPayload = link; externalId = j.id ?? j.paymentId ?? null; }
      await logEvent({ kind: "sbp.create", provider: "uzum", direction: "out", payload: { amount: p.amount, response: j }, status: res.ok && link ? "ok" : "error", integrationId: r.integrationId });
    } else {
      await logEvent({ kind: "sbp.create", provider: r.provider, direction: "out", payload: { amount: p.amount, purpose: p.purpose, url }, status: "sandbox", integrationId: r.integrationId });
    }
  } catch (e) {
    await logEvent({ kind: "sbp.create", provider: r.provider, direction: "out", payload: { error: String(e) }, status: "error", integrationId: r.integrationId });
  }
  await db.insert(schema.paymentLinks).values({ id, amount: p.amount, purpose: p.purpose, dealId: p.dealId ?? null, documentId: p.documentId ?? null, companyId: p.companyId ?? null, provider: r.live ? r.provider : "sandbox", url, qrPayload, externalId, expiresAt });
  return { id, url, qrPayload, sandbox: !r.live, expiresAt };
}

export async function getPaymentLink(id: string) {
  return db.query.paymentLinks.findFirst({ where: eq(schema.paymentLinks.id, id) });
}
