import { resolve, logEvent } from "./registry";

export async function sendSms(to: string, text: string): Promise<{ ok: boolean; sandbox: boolean; externalId?: string; error?: string }> {
  const r = await resolve("sms");
  const phone = to.replace(/\D/g, "");
  if (r.live && r.provider === "smsru") {
    try {
      const url = `https://sms.ru/sms/send?api_id=${encodeURIComponent(r.config.apiId)}&to=${phone}&msg=${encodeURIComponent(text)}&json=1${r.config.from ? `&from=${encodeURIComponent(r.config.from)}` : ""}`;
      const res = await fetch(url);
      const j = (await res.json()) as { status: string; sms?: Record<string, { sms_id?: string; status_text?: string }> };
      const first = j.sms ? Object.values(j.sms)[0] : undefined;
      const ok = j.status === "OK";
      await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, response: j }, status: ok ? "ok" : "error", integrationId: r.integrationId });
      return { ok, sandbox: false, externalId: first?.sms_id, error: ok ? undefined : first?.status_text };
    } catch (e) {
      await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, error: String(e) }, status: "error", integrationId: r.integrationId });
      return { ok: false, sandbox: false, error: String(e) };
    }
  }
  if (r.live && r.provider === "smsc") {
    const url = `https://smsc.ru/sys/send.php?login=${encodeURIComponent(r.config.login)}&psw=${encodeURIComponent(r.config.password)}&phones=${phone}&mes=${encodeURIComponent(text)}&fmt=3`;
    const res = await fetch(url);
    const j = (await res.json()) as { id?: number; error?: string };
    await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, response: j }, status: j.error ? "error" : "ok", integrationId: r.integrationId });
    return { ok: !j.error, sandbox: false, externalId: j.id ? String(j.id) : undefined, error: j.error };
  }
  await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text }, status: "sandbox", integrationId: r.integrationId });
  return { ok: true, sandbox: true, externalId: `sandbox_${Date.now()}` };
}
