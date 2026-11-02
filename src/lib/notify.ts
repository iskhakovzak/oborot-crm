import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolve, logEvent } from "./integrations/registry";
import { newId } from "./utils";

/** Уведомление сотруднику: в Telegram (если привязан чат) + задача-напоминание в CRM */
export async function notifyUser(userId: string, text: string) {
  const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!u) return;
  const r = await resolve("telegram_bot");
  if (u.telegramChatId && r.live && r.config.botToken) {
    try {
      await fetch(`https://api.telegram.org/bot${r.config.botToken}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: u.telegramChatId, text }) });
      await logEvent({ kind: "notify.telegram", provider: "telegram", direction: "out", payload: { userId, text } });
      return;
    } catch (e) {
      await logEvent({ kind: "notify.telegram", provider: "telegram", direction: "out", payload: { userId, error: String(e) }, status: "error" });
    }
  }
  await logEvent({ kind: "notify.telegram", provider: "telegram", direction: "out", payload: { userId, text }, status: "sandbox" });
  await db.insert(schema.tasks).values({ id: newId("task"), title: text.slice(0, 120), description: text, assigneeId: userId, dueAt: new Date(Date.now() + 3600_000).toISOString(), source: "automation", priority: "high" });
}
