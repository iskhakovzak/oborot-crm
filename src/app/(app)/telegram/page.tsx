import { desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting, appUrl } from "@/lib/settings";
import { resolve } from "@/lib/integrations/registry";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { TelegramView } from "./telegram-view";
import { BOT_EXAMPLES } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telegram-бот" };

export default async function TelegramPage() {
  const user = await requireUser();
  if (!can(user.actor, "settings", "view")) return <EmptyState icon={<Bot />} title="Нет доступа" description="Раздел доступен администраторам." />;
  const [tg, r] = await Promise.all([getSetting("telegram"), resolve("telegram_bot")]);
  const linked = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, email: schema.users.email, telegramChatId: schema.users.telegramChatId }).from(schema.users).where(isNotNull(schema.users.telegramChatId));
  const log = await db
    .select({ c: schema.telegramCommands, user: { name: schema.users.name, color: schema.users.color } })
    .from(schema.telegramCommands)
    .leftJoin(schema.users, eq(schema.telegramCommands.userId, schema.users.id))
    .orderBy(desc(schema.telegramCommands.createdAt))
    .limit(30);

  return (
    <>
      <PageHeader
        title="Telegram-бот для сотрудников"
        description="Пункт 20: любое действие в CRM — командой из Telegram. «Создай сделку», «поставь задачу Ивану», «покажи продажи за неделю» — бот поймёт и сделает."
        actions={r.live ? <Badge tone="good" dot>Бот подключён</Badge> : <Badge tone="warn" dot>Демо-режим</Badge>}
      />
      <TelegramView
        live={r.live}
        hasToken={!!r.config.botToken}
        webhookUrl={appUrl("/api/telegram/webhook")}
        settings={{ webhookSecret: tg.webhookSecret, enabled: tg.enabled }}
        linked={linked.map((u) => ({ id: u.id, name: u.name, color: u.color, email: u.email, chatId: u.telegramChatId! }))}
        log={log.map(({ c, user: u }) => ({ id: c.id, text: c.text, intent: c.intent, result: c.result, status: c.status, createdAt: c.createdAt, userName: u?.name ?? null, userColor: u?.color ?? null, chatId: c.chatId }))}
        currentUser={{ name: user.name, email: user.email, chatId: user.telegramChatId }}
        canEdit={can(user.actor, "settings", "edit")}
        examples={BOT_EXAMPLES}
      />
    </>
  );
}
