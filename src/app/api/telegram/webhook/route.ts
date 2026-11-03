import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { resolve, logEvent } from "@/lib/integrations/registry";
import { executeCommand, BOT_HELP } from "@/lib/telegram-bot";
import { newId } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Update = { update_id?: number; message?: { message_id: number; chat: { id: number | string; first_name?: string; username?: string }; from?: { id: number; first_name?: string }; text?: string } };

async function reply(chatId: string | number, text: string) {
  const r = await resolve("telegram_bot");
  if (!r.live || !r.config.botToken) {
    await logEvent({ kind: "telegram.reply", provider: "telegram", direction: "out", payload: { chatId, text }, status: "sandbox", integrationId: r.integrationId });
    return { sandbox: true };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${r.config.botToken}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
    const j = (await res.json()) as { ok: boolean; description?: string };
    await logEvent({ kind: "telegram.reply", provider: "telegram", direction: "out", payload: { chatId, text, ok: j.ok, description: j.description }, status: j.ok ? "ok" : "error", integrationId: r.integrationId });
  } catch (e) {
    await logEvent({ kind: "telegram.reply", provider: "telegram", direction: "out", payload: { chatId, error: String(e) }, status: "error", integrationId: r.integrationId });
  }
  return { sandbox: false };
}

/** 20. Вебхук Telegram Bot API: команды сотрудников → действия в CRM */
export async function POST(req: Request) {
  const settings = await getSetting("telegram");
  if (settings.webhookSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== settings.webhookSecret) {
      await logEvent({ kind: "telegram.update", provider: "telegram", direction: "in", payload: { error: "bad secret" }, status: "error" });
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }
  let update: Update;
  try {
    update = (await req.json()) as Update;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const msg = update.message;
  if (!msg?.text || !msg.chat) return NextResponse.json({ ok: true, skipped: true });
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  await logEvent({ kind: "telegram.update", provider: "telegram", direction: "in", payload: { chatId, text, from: msg.from?.first_name ?? msg.chat.first_name ?? null } });

  if (!settings.enabled) {
    const r = await reply(chatId, "Бот временно выключен администратором.");
    return NextResponse.json({ ok: true, replied: "disabled", sandbox: r.sandbox });
  }

  // привязка: /start email@company.ru
  const start = text.match(/^\/start(?:@\w+)?\s+(\S+@\S+)/i);
  if (start) {
    const email = start[1].toLowerCase();
    const u = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!u || !u.isActive) {
      const r = await reply(chatId, `Сотрудник с email ${email} не найден в CRM. Проверьте адрес или обратитесь к администратору.`);
      return NextResponse.json({ ok: true, replied: "user_not_found", sandbox: r.sandbox });
    }
    await db.update(schema.users).set({ telegramChatId: chatId }).where(eq(schema.users.id, u.id));
    await db.insert(schema.telegramCommands).values({ id: newId("tgc"), chatId, userId: u.id, text, intent: "link", result: `Чат привязан к ${u.name}`, status: "ok" });
    const r = await reply(chatId, `Готово, ${u.name.split(" ")[0]}! Чат привязан к вашему аккаунту. ${BOT_HELP}`);
    return NextResponse.json({ ok: true, replied: "linked", sandbox: r.sandbox });
  }

  const user = await db.query.users.findFirst({ where: eq(schema.users.telegramChatId, chatId) });
  if (!user || !user.isActive) {
    const r = await reply(chatId, "Этот чат не привязан к сотруднику CRM. Отправьте команду:\n/start ваш@email — тот, под которым вы входите в Оборот.");
    await db.insert(schema.telegramCommands).values({ id: newId("tgc"), chatId, userId: null, text, intent: "unknown", result: "Чат не привязан к сотруднику", status: "unknown" });
    return NextResponse.json({ ok: true, replied: "not_linked", sandbox: r.sandbox });
  }
  const result = await executeCommand(text, { id: user.id, name: user.name }, chatId);
  const r = await reply(chatId, result.text);
  return NextResponse.json({ ok: true, intent: result.intent, status: result.status, sandbox: r.sandbox, text: result.text });
}

export async function GET() {
  const r = await resolve("telegram_bot");
  return NextResponse.json({ ok: true, bot: r.live ? "connected" : "sandbox" });
}
