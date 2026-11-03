import { resolve, logEvent } from "./registry";

/** Кэш токена Eskiz (живёт 30 дней, обновляем раз в сутки) */
const eskizToken: { email: string; token: string; expiresAt: number } = { email: "", token: "", expiresAt: 0 };

/** Авторизация в Eskiz.uz: email + пароль → Bearer-токен */
export async function eskizAuth(email: string, password: string): Promise<string> {
  if (eskizToken.email === email && eskizToken.token && eskizToken.expiresAt > Date.now()) return eskizToken.token;
  const res = await fetch("https://notify.eskiz.uz/api/auth/login", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email, password }) });
  const j = (await res.json().catch(() => ({}))) as { data?: { token?: string }; message?: string };
  const token = j.data?.token;
  if (!res.ok || !token) throw new Error(`Eskiz: не удалось авторизоваться (${j.message ?? res.status})`);
  eskizToken.email = email; eskizToken.token = token; eskizToken.expiresAt = Date.now() + 24 * 3600_000;
  return token;
}

/** Нормализация номера для узбекских шлюзов: 998XXXXXXXXX (9 цифр без кода — добавляем 998) */
function uzPhone(to: string) {
  const d = to.replace(/\D/g, "");
  return d.length === 9 ? `998${d}` : d;
}

export async function sendSms(to: string, text: string): Promise<{ ok: boolean; sandbox: boolean; externalId?: string; error?: string }> {
  const r = await resolve("sms");
  const phone = uzPhone(to);
  if (r.live && r.provider === "eskiz" && r.config.email && r.config.password) {
    try {
      const token = await eskizAuth(r.config.email, r.config.password);
      const form = new URLSearchParams({ mobile_phone: phone, message: text, from: r.config.from || "4546" });
      const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, accept: "application/json" }, body: form });
      const j = (await res.json().catch(() => ({}))) as { id?: string | number; status?: string; message?: string };
      const ok = res.ok && (j.status === "waiting" || j.status === "success" || !!j.id);
      await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, response: j }, status: ok ? "ok" : "error", integrationId: r.integrationId });
      return { ok, sandbox: false, externalId: j.id ? String(j.id) : undefined, error: ok ? undefined : j.message ?? `Eskiz ответил ${res.status}` };
    } catch (e) {
      await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, error: String(e) }, status: "error", integrationId: r.integrationId });
      return { ok: false, sandbox: false, error: String(e) };
    }
  }
  if (r.live && r.provider === "playmobile" && r.config.login) {
    try {
      const messageId = `crm-${Date.now()}`;
      const res = await fetch("https://send.smsxabar.uz/broker-api/send", { method: "POST", headers: { "content-type": "application/json", Authorization: "Basic " + Buffer.from(`${r.config.login}:${r.config.password}`).toString("base64") }, body: JSON.stringify({ messages: [{ recipient: phone, "message-id": messageId, sms: { originator: r.config.originator || "3700", content: { text } } }] }) });
      const body = await res.text();
      await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, status: res.status, body }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
      return { ok: res.ok, sandbox: false, externalId: messageId, error: res.ok ? undefined : `Playmobile ответил ${res.status}` };
    } catch (e) {
      await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text, error: String(e) }, status: "error", integrationId: r.integrationId });
      return { ok: false, sandbox: false, error: String(e) };
    }
  }
  await logEvent({ kind: "sms.send", provider: r.provider, direction: "out", payload: { to: phone, text }, status: "sandbox", integrationId: r.integrationId });
  return { ok: true, sandbox: true, externalId: `sandbox_${Date.now()}` };
}
