import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { appUrl } from "@/lib/settings";
import { resolve, logEvent } from "./registry";

/** Ссылка на оплату по СБП. С подключённым банком — реальный QR от банка, иначе демо-страница оплаты внутри CRM. */
export async function createPaymentLink(p: { amount: number; purpose: string; dealId?: string | null; documentId?: string | null; companyId?: string | null; ttlHours?: number }) {
  const r = await resolve("sbp");
  const id = newId("pay");
  const expiresAt = new Date(Date.now() + (p.ttlHours ?? 72) * 3600_000).toISOString();
  let url = appUrl(`/pay/${id}`);
  let qrPayload = `https://qr.nspk.ru/${id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 32)}?type=02&bank=100000000004&sum=${Math.round(p.amount * 100)}&cur=RUB&crc=DEMO`;
  let externalId: string | null = null;
  try {
    if (r.live && r.provider === "tbank" && r.config.terminalKey) {
      const { createHash } = await import("node:crypto");
      const body: Record<string, string | number> = { TerminalKey: r.config.terminalKey, Amount: Math.round(p.amount * 100), OrderId: id, Description: p.purpose.slice(0, 250) };
      const token = createHash("sha256").update(Object.entries({ ...body, Password: r.config.password }).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => String(v)).join("")).digest("hex");
      const res = await fetch("https://securepay.tinkoff.ru/v2/Init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, Token: token, PayType: "O", DATA: { QR: "true" } }) });
      const j = (await res.json()) as { Success?: boolean; PaymentURL?: string; PaymentId?: string; Message?: string };
      if (j.Success && j.PaymentURL) { url = j.PaymentURL; qrPayload = j.PaymentURL; externalId = j.PaymentId ?? null; }
      await logEvent({ kind: "sbp.create", provider: "tbank", direction: "out", payload: { amount: p.amount, response: j }, status: j.Success ? "ok" : "error", integrationId: r.integrationId });
    } else if (r.live && r.provider === "tochka" && r.config.token) {
      const res = await fetch("https://enter.tochka.com/uapi/sbp/v1.0/qr-code/merchant/" + r.config.merchantId, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${r.config.token}` }, body: JSON.stringify({ Data: { amount: Math.round(p.amount * 100), currency: "RUB", paymentPurpose: p.purpose, qrcType: "02", ttl: (p.ttlHours ?? 72) * 60 } }) });
      const j = (await res.json()) as { Data?: { payload?: string; qrcId?: string } };
      if (j.Data?.payload) { qrPayload = j.Data.payload; url = j.Data.payload; externalId = j.Data.qrcId ?? null; }
      await logEvent({ kind: "sbp.create", provider: "tochka", direction: "out", payload: { amount: p.amount, response: j }, integrationId: r.integrationId });
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
