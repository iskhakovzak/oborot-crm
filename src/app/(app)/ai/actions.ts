"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSetting, setSetting, type AiSettings } from "@/lib/settings";
import { receiveMessage, findOrCreateConversation } from "@/lib/integrations/messaging";
import { draftReply, handleIncomingCallAi } from "@/lib/integrations/ai";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function saveAiSettings(p: Partial<AiSettings>): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return { ok: false, error: "Нет прав на изменение настроек" };
  const clean: Partial<AiSettings> = {
    model: (p.model ?? "").trim() || "claude-opus-5-5",
    assistantName: (p.assistantName ?? "").trim() || "Мария",
    tone: (p.tone ?? "").trim(),
    knowledge: (p.knowledge ?? "").trim(),
    chatAutoReply: !!p.chatAutoReply,
    chatHandoffRule: (p.chatHandoffRule ?? "").trim(),
    maxAutoReplies: Math.max(1, Math.min(50, Number(p.maxAutoReplies) || 5)),
    callsEnabled: !!p.callsEnabled,
    callGreeting: (p.callGreeting ?? "").trim(),
    callScript: (p.callScript ?? "").trim(),
  };
  await setSetting("ai", clean);
  revalidatePath("/ai");
  return { ok: true };
}

/** Песочница: временная переписка канала web, ответ ИИ не отправляется клиенту */
export async function testReply(text: string): Promise<R<{ reply: string; handoff: boolean; sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "view") && !can(user.actor, "conversations", "view")) return { ok: false, error: "Нет доступа" };
  const t = text.trim();
  if (!t) return { ok: false, error: "Введите сообщение клиента" };
  const address = `sandbox-${user.id}`;
  const conv = await findOrCreateConversation({ channel: "web", address, name: `Песочница · ${user.name}`, assigneeId: user.id });
  // очищаем прошлые пробы, чтобы контекст был чистым
  await db.delete(schema.messages).where(eq(schema.messages.conversationId, conv.id));
  await receiveMessage({ channel: "web", address, name: conv.peerName, text: t, externalId: `sandbox_${Date.now()}` });
  const r = await draftReply(conv.id);
  await db.update(schema.conversations).set({ unread: 0, status: "closed" }).where(eq(schema.conversations.id, conv.id));
  if (!r.text) return { ok: false, error: "ИИ не смог составить ответ" };
  return { ok: true, reply: r.text, handoff: r.handoff, sandbox: r.sandbox };
}

export async function testCall(phone: string): Promise<R<{ transcript: string; summary: string; nextStep: string; createLead: boolean; sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "view") && !can(user.actor, "calls", "view")) return { ok: false, error: "Нет доступа" };
  const ai = await getSetting("ai");
  const r = await handleIncomingCallAi({ phone: phone.trim() || "+998 90 000-00-00", contactName: `Тестовый клиент`, companyName: null });
  if (!r.transcript) return { ok: false, error: `${ai.assistantName} не смогла обработать звонок` };
  return { ok: true, ...r };
}
