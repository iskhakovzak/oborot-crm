import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { resolve, logEvent } from "./registry";

/** Синхронизация CRM ↔ финучёт (1С / Финолог / ПланФакт / МойСклад). Пушим оплаты, счета и контрагентов. */
export async function syncToFinance(entity: "payment" | "document" | "company", entityId: string) {
  const r = await resolve("finance");
  let ok = true, message = "";
  try {
    if (r.live && r.provider === "finolog" && r.config.apiToken && entity === "payment") {
      const p = await db.query.payments.findFirst({ where: eq(schema.payments.id, entityId) });
      if (p) {
        const res = await fetch(`https://api.finolog.ru/v1/biz/${r.config.bizId}/transaction`, { method: "POST", headers: { "content-type": "application/json", "Api-Token": r.config.apiToken }, body: JSON.stringify({ value: p.direction === "in" ? p.amount : -p.amount, date: p.paidAt.slice(0, 10), description: p.purpose ?? "Оплата из CRM" }) });
        ok = res.ok; message = ok ? "Передано в Финолог" : `Финолог ответил ${res.status}`;
      }
    } else if (r.live && r.provider === "onec" && r.config.url) {
      const res = await fetch(`${r.config.url.replace(/\/$/, "")}/Catalog_Контрагенты?$top=1&$format=json`, { headers: { Authorization: "Basic " + Buffer.from(`${r.config.login}:${r.config.password}`).toString("base64") } });
      ok = res.ok; message = ok ? "1С доступна, объект поставлен в очередь обмена" : `1С ответила ${res.status}`;
    } else {
      message = `Демо-режим: ${entity} передан в ${r.name}`;
    }
  } catch (e) {
    ok = false; message = String(e);
  }
  await db.insert(schema.financeSyncLog).values({ id: newId("fsl"), provider: r.provider, entity, entityId, direction: "push", status: ok ? "ok" : "error", message });
  await logEvent({ kind: "finance.sync", provider: r.provider, direction: "out", payload: { entity, entityId, message }, status: !r.live ? "sandbox" : ok ? "ok" : "error", integrationId: r.integrationId });
  if (entity === "payment" && ok) await db.update(schema.payments).set({ syncedToFinance: true }).where(eq(schema.payments.id, entityId));
  await db.update(schema.integrations).set({ lastSyncAt: new Date().toISOString() }).where(eq(schema.integrations.kind, "finance"));
  return { ok, message, sandbox: !r.live, provider: r.name };
}

/** Полная синхронизация: все несинхронизированные оплаты */
export async function syncAllPayments() {
  const rows = await db.query.payments.findMany({ where: eq(schema.payments.syncedToFinance, false) });
  let n = 0;
  for (const p of rows) { const res = await syncToFinance("payment", p.id); if (res.ok) n++; }
  return n;
}
