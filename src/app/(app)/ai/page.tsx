import { and, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { resolve } from "@/lib/integrations/registry";
import { PageHeader, Stat } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { AiSettingsForm } from "./ai-settings-form";
import { AiSandbox } from "./ai-sandbox";

export const dynamic = "force-dynamic";
export const metadata = { title: "ИИ-помощник" };

export default async function AiPage() {
  const user = await requireUser();
  const ai = await getSetting("ai");
  const r = await resolve("ai");
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [[msgs], [calls], [handoffs], [convs]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(schema.messages).where(and(eq(schema.messages.isAi, true), gte(schema.messages.createdAt, since))),
    db.select({ n: sql<number>`count(*)` }).from(schema.calls).where(and(eq(schema.calls.aiHandled, true), gte(schema.calls.startedAt, since))),
    db.select({ n: sql<number>`count(*)` }).from(schema.tasks).where(and(eq(schema.tasks.source, "ai"), gte(schema.tasks.createdAt, since))),
    db.select({ n: sql<number>`count(*)` }).from(schema.conversations).where(and(eq(schema.conversations.aiEnabled, true), eq(schema.conversations.status, "open"))),
  ]);
  const canEdit = can(user.actor, "settings", "edit");
  const canIntegrations = can(user.actor, "integrations", "view");

  return (
    <>
      <PageHeader
        title="ИИ-помощник"
        description={`${ai.assistantName} отвечает клиентам в переписках, принимает входящие звонки и разбирает команды сотрудников из Telegram.`}
        actions={
          r.live ? (
            <Badge tone="good" dot>Подключено · {r.name}</Badge>
          ) : (
            <Badge tone="warn" dot>Демо-режим</Badge>
          )
        }
      />
      {!r.live && (
        <div className="mb-5 rounded-[10px] border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink-2">
          Ответы и звонки сейчас генерируются встроенными шаблонами. Чтобы включить настоящий ИИ, добавьте ключ Anthropic {canIntegrations ? <Link href="/integrations" className="font-medium text-info hover:underline">в Интеграциях</Link> : "в Интеграциях"} или переменную окружения <code className="rounded bg-black/5 px-1">ANTHROPIC_API_KEY</code>. Модель: <span className="tnum">{ai.model}</span>.
        </div>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ответов ИИ в чатах" value={msgs.n} sub="за 7 дней" tone="info" />
        <Stat label="Звонков принял ИИ" value={calls.n} sub="за 7 дней" tone="info" />
        <Stat label="Передано менеджеру" value={handoffs.n} sub="задачи от ИИ за 7 дней" tone={handoffs.n > 0 ? "warn" : undefined} />
        <Stat label="Переписок на ИИ" value={convs.n} sub="открытых, ИИ отвечает сам" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_1fr]">
        <AiSettingsForm settings={ai} canEdit={canEdit} />
        <AiSandbox assistantName={ai.assistantName} live={r.live} />
      </div>
    </>
  );
}
