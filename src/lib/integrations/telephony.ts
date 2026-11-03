import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { resolve, logEvent } from "./registry";
import { logActivity } from "@/lib/activity";

/** Исходящий звонок клиенту (callback: сначала звонит менеджеру, потом клиенту). Автоматический звонок = звонок от ИИ. */
export async function placeCall(p: { phone: string; userId?: string | null; contactId?: string | null; companyId?: string | null; dealId?: string | null; byAi?: boolean; script?: string }) {
  const r = await resolve("telephony");
  const id = newId("call");
  const phone = p.phone.replace(/[^\d+]/g, "");
  let status: "queued" | "ringing" | "ai_handled" = "queued";
  let externalId: string | null = null;
  try {
    if (r.live && r.provider === "onlinepbx" && r.config.apiKey && r.config.domain && !p.byAi) {
      // OnlinePBX: callback-звонок (сначала внутренний номер менеджера, потом клиент)
      const res = await fetch(`https://api2.onlinepbx.ru/${r.config.domain}/call/now.json`, { method: "POST", headers: { "x-pbx-authentication": r.config.apiKey, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ from: r.config.fromExtension ?? "", to: phone }) });
      status = res.ok ? "ringing" : "queued";
      externalId = id;
      await logEvent({ kind: "call.place", provider: "onlinepbx", direction: "out", payload: { phone, ok: res.ok }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
    } else if (r.live && r.provider === "zadarma" && r.config.userKey && !p.byAi) {
      // Zadarma: /v1/request/callback/ с подписью HMAC-SHA1 (user key + secret)
      const { createHmac, createHash } = await import("node:crypto");
      const params = new URLSearchParams({ from: r.config.fromExtension ?? "", to: phone });
      const sorted = new URLSearchParams([...params.entries()].sort(([a], [b]) => a.localeCompare(b))).toString();
      const sign = Buffer.from(createHmac("sha1", r.config.secretKey ?? "").update("/v1/request/callback/" + sorted + createHash("md5").update(sorted).digest("hex")).digest("hex")).toString("base64");
      const res = await fetch(`https://api.zadarma.com/v1/request/callback/?${sorted}`, { headers: { Authorization: `${r.config.userKey}:${sign}` } });
      status = res.ok ? "ringing" : "queued";
      externalId = id;
      await logEvent({ kind: "call.place", provider: "zadarma", direction: "out", payload: { phone, ok: res.ok }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
    } else if (r.live && r.provider === "sipuni" && r.config.user && !p.byAi) {
      const { createHash } = await import("node:crypto");
      const hash = createHash("md5").update([r.config.fromExtension ?? "", phone, r.config.user, r.config.secret ?? ""].join("+")).digest("hex");
      const res = await fetch("https://sipuni.com/api/callback/call_number", { method: "POST", body: new URLSearchParams({ phone, sipnumber: r.config.fromExtension ?? "", user: r.config.user, hash }) });
      status = res.ok ? "ringing" : "queued";
      externalId = id;
      await logEvent({ kind: "call.place", provider: "sipuni", direction: "out", payload: { phone, ok: res.ok }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
    } else {
      await logEvent({ kind: "call.place", provider: r.provider, direction: "out", payload: { phone, byAi: !!p.byAi, script: p.script }, status: "sandbox", integrationId: r.integrationId });
      status = p.byAi ? "ai_handled" : "ringing";
      externalId = `sandbox_${Date.now()}`;
    }
  } catch (e) {
    await logEvent({ kind: "call.place", provider: r.provider, direction: "out", payload: { phone, error: String(e) }, status: "error", integrationId: r.integrationId });
  }
  await db.insert(schema.calls).values({ id, direction: "out", phone, userId: p.userId ?? null, contactId: p.contactId ?? null, companyId: p.companyId ?? null, dealId: p.dealId ?? null, provider: r.live ? r.provider : "sandbox", externalId, status, aiHandled: !!p.byAi, transcript: p.byAi && p.script ? `ИИ: ${p.script}` : null });
  await logActivity({ type: "call", title: p.byAi ? "Автоматический звонок клиенту" : "Исходящий звонок", body: phone, dealId: p.dealId, companyId: p.companyId, contactId: p.contactId, userId: p.userId, meta: { callId: id } });
  return { id, status, sandbox: !r.live };
}

export async function completeCall(id: string, p: { status: "completed" | "missed" | "busy"; durationSec?: number; recordingUrl?: string | null; transcript?: string | null; aiSummary?: string | null }) {
  await db.update(schema.calls).set({ status: p.status, durationSec: p.durationSec ?? 0, recordingUrl: p.recordingUrl ?? null, transcript: p.transcript ?? null, aiSummary: p.aiSummary ?? null }).where(eq(schema.calls.id, id));
}
