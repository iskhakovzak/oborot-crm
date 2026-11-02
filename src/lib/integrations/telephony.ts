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
    if (r.live && r.provider === "mango" && !p.byAi) {
      const json = JSON.stringify({ command_id: id, from: { extension: r.config.fromExtension }, to_number: phone });
      const { createHash } = await import("node:crypto");
      const sign = createHash("sha256").update(r.config.apiKey + json + r.config.apiSalt).digest("hex");
      const body = new URLSearchParams({ vpbx_api_key: r.config.apiKey, sign, json });
      const res = await fetch("https://app.mango-office.ru/vpbx/commands/callback", { method: "POST", body });
      status = res.ok ? "ringing" : "queued";
      externalId = id;
      await logEvent({ kind: "call.place", provider: "mango", direction: "out", payload: { phone, ok: res.ok }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
    } else if (r.live && r.provider === "zadarma" && !p.byAi) {
      await logEvent({ kind: "call.place", provider: "zadarma", direction: "out", payload: { phone }, integrationId: r.integrationId });
      status = "ringing";
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
