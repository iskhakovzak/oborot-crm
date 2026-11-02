import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { draftReply } from "./integrations/ai";
import { sendMessage } from "./integrations/messaging";
import { getSetting } from "./settings";
import { logActivity } from "./activity";
import { newId } from "./utils";

/** 23. ИИ отвечает клиенту в переписке, при необходимости передаёт менеджеру */
export async function aiReplyToConversation(conversationId: string): Promise<{ sent: boolean; handoff: boolean; reason: string; text?: string }> {
  const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) });
  if (!conv) return { sent: false, handoff: false, reason: "Переписка не найдена" };
  const ai = await getSetting("ai");
  if (!conv.aiEnabled && !ai.chatAutoReply) return { sent: false, handoff: false, reason: "ИИ выключен для этой переписки" };
  const aiCount = (await db.select({ id: schema.messages.id }).from(schema.messages).where(and(eq(schema.messages.conversationId, conversationId), eq(schema.messages.isAi, true)))).length;
  if (aiCount >= ai.maxAutoReplies) return { sent: false, handoff: true, reason: `Лимит автоответов (${ai.maxAutoReplies}) исчерпан — передано менеджеру` };
  const r = await draftReply(conversationId);
  if (!r.text) return { sent: false, handoff: true, reason: "ИИ не смог составить ответ" };
  await sendMessage({ conversationId, channel: conv.channel, text: r.text, companyId: conv.companyId, contactId: conv.contactId, dealId: conv.dealId, isAi: true });
  if (r.handoff) {
    const assignee = conv.assigneeId ?? (conv.companyId ? (await db.query.companies.findFirst({ where: eq(schema.companies.id, conv.companyId) }))?.managerId : null) ?? (await db.query.users.findFirst({ where: eq(schema.users.isActive, true) }))?.id ?? null;
    await db.update(schema.conversations).set({ aiEnabled: false, assigneeId: assignee }).where(eq(schema.conversations.id, conversationId));
    await db.insert(schema.tasks).values({ id: newId("task"), title: `Подключиться к переписке с ${conv.peerName} (${conv.channel})`, description: `ИИ передал диалог менеджеру. Последний ответ ИИ: ${r.text}`, assigneeId: assignee, dealId: conv.dealId, companyId: conv.companyId, dueAt: new Date(Date.now() + 30 * 60_000).toISOString(), priority: "high", source: "ai" });
    await logActivity({ type: "ai", title: "ИИ передал переписку менеджеру", body: r.text, dealId: conv.dealId, companyId: conv.companyId, contactId: conv.contactId });
  }
  return { sent: true, handoff: r.handoff, reason: "ok", text: r.text };
}
