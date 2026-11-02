import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { resolve, logEvent } from "./registry";

/** Передача лида/продажи в Яндекс Метрику как офлайн-конверсии (по ClientID) и в системы сквозной аналитики */
export async function sendConversion(p: { dealId: string; goal: "lead" | "sale" | string; revenue?: number }) {
  const deal = await db.query.deals.findFirst({ where: eq(schema.deals.id, p.dealId) });
  if (!deal) return { ok: false, sandbox: true, message: "Сделка не найдена" };
  const r = await resolve("analytics");
  const goalName = p.goal === "lead" ? r.config.goalLead || "crm_lead" : p.goal === "sale" ? r.config.goalSale || "crm_sale" : p.goal;
  const clientId = deal.ymClientId;
  const id = newId("ymx");
  let status: "sent" | "sandbox" | "error" = "sandbox";
  let response = "";
  if (!clientId) {
    response = "У сделки нет ClientID Метрики (ymClientId) — конверсию не к чему привязать";
    status = "error";
  } else if (r.live && r.provider === "yandex_metrika" && r.config.oauthToken && r.config.counterId) {
    try {
      const csv = `ClientId,Target,DateTime,Price,Currency\n${clientId},${goalName},${Math.floor(Date.now() / 1000)},${p.revenue ?? deal.amount},RUB\n`;
      const form = new FormData();
      form.append("file", new Blob([csv], { type: "text/csv" }), "conversions.csv");
      const res = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${r.config.counterId}/offline_conversions/upload?client_id_type=CLIENT_ID`, { method: "POST", headers: { Authorization: `OAuth ${r.config.oauthToken}` }, body: form });
      response = await res.text();
      status = res.ok ? "sent" : "error";
    } catch (e) {
      response = String(e); status = "error";
    }
  } else if (r.live && r.provider === "roistat" && r.config.apiKey) {
    const res = await fetch(`https://cloud.roistat.com/api/v1/project/add-orders?project=${r.config.projectId}&key=${r.config.apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ id: deal.number, name: deal.title, price: p.revenue ?? deal.amount, roistat: clientId, status: goalName }]) });
    response = await res.text(); status = res.ok ? "sent" : "error";
  } else {
    response = `Демо-режим: конверсия «${goalName}» для ClientID ${clientId} поставлена в очередь (${r.name})`;
  }
  await db.insert(schema.analyticsExports).values({ id, provider: r.provider, dealId: deal.id, goal: goalName, clientId, revenue: p.revenue ?? deal.amount, status, response });
  await logEvent({ kind: "analytics.conversion", provider: r.provider, direction: "out", payload: { dealId: deal.id, goal: goalName, clientId, status }, status: status === "sent" ? "ok" : status === "error" ? "error" : "sandbox", integrationId: r.integrationId });
  return { ok: status !== "error", sandbox: status === "sandbox", message: response };
}
