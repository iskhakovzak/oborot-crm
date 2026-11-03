"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting, setSetting, appUrl } from "@/lib/settings";
import { resolve, logEvent } from "@/lib/integrations/registry";
import { executeCommand } from "@/lib/telegram-bot";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function runConsoleCommand(text: string): Promise<R<{ text: string; intent: string; status: string; sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "view")) return { ok: false, error: "Нет доступа" };
  const r = await executeCommand(text, { id: user.id, name: user.name }, user.telegramChatId ?? "console");
  revalidatePath("/telegram");
  return { ok: true, text: r.text, intent: r.intent, status: r.status, sandbox: r.sandbox };
}

export async function saveTelegramSettings(p: { webhookSecret: string; enabled: boolean }): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return { ok: false, error: "Нет прав" };
  await setSetting("telegram", { webhookSecret: p.webhookSecret.trim(), enabled: p.enabled });
  revalidatePath("/telegram");
  return { ok: true };
}

export async function setWebhook(): Promise<R<{ url: string; sandbox: boolean; description?: string }>> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return { ok: false, error: "Нет прав" };
  const r = await resolve("telegram_bot");
  const url = appUrl("/api/telegram/webhook");
  const tg = await getSetting("telegram");
  if (!r.live || !r.config.botToken) {
    await logEvent({ kind: "telegram.set_webhook", provider: "telegram", direction: "out", payload: { url }, status: "sandbox", integrationId: r.integrationId });
    return { ok: true, url, sandbox: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${r.config.botToken}/setWebhook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, secret_token: tg.webhookSecret || undefined, allowed_updates: ["message"] }) });
    const j = (await res.json()) as { ok: boolean; description?: string };
    await logEvent({ kind: "telegram.set_webhook", provider: "telegram", direction: "out", payload: { url, response: j }, status: j.ok ? "ok" : "error", integrationId: r.integrationId });
    if (!j.ok) return { ok: false, error: j.description ?? "Telegram отклонил вебхук" };
    return { ok: true, url, sandbox: false, description: j.description };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function unlinkUser(userId: string): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return { ok: false, error: "Нет прав" };
  await db.update(schema.users).set({ telegramChatId: null }).where(eq(schema.users.id, userId));
  revalidatePath("/telegram");
  return { ok: true };
}
