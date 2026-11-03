"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { Channel } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sendMessage, receiveMessage, findOrCreateConversation } from "@/lib/integrations/messaging";
import { draftReply } from "@/lib/integrations/ai";
import { emit } from "@/lib/events";
import { logActivity } from "@/lib/activity";
import { createDealQuick } from "@/lib/telegram-bot";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function conv(id: string) {
  const c = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) });
  if (!c) throw new Error("Переписка не найдена");
  return c;
}

export async function sendReply(p: { conversationId: string; text: string }): Promise<R<{ sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "edit")) return { ok: false, error: "Нет прав на ответ в переписках" };
  const text = p.text.trim();
  if (!text) return { ok: false, error: "Пустое сообщение" };
  const c = await conv(p.conversationId);
  const r = await sendMessage({ conversationId: c.id, channel: c.channel, text, companyId: c.companyId, contactId: c.contactId, dealId: c.dealId, userId: user.id });
  if (!r.ok) return { ok: false, error: r.error ?? "Не удалось отправить" };
  await logActivity({ type: "message", title: `Сообщение в ${c.channel}: ${c.peerName}`, body: text, dealId: c.dealId, companyId: c.companyId, contactId: c.contactId, userId: user.id, meta: { conversationId: c.id } });
  revalidatePath("/inbox");
  return { ok: true, sandbox: r.sandbox };
}

export async function suggestReply(conversationId: string): Promise<R<{ text: string; handoff: boolean; sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "view")) return { ok: false, error: "Нет доступа" };
  const r = await draftReply(conversationId);
  if (!r.text) return { ok: false, error: "ИИ не смог составить ответ" };
  return { ok: true, ...r };
}

export async function setAi(conversationId: string, enabled: boolean): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "edit")) return { ok: false, error: "Нет прав" };
  await db.update(schema.conversations).set({ aiEnabled: enabled }).where(eq(schema.conversations.id, conversationId));
  revalidatePath("/inbox");
  return { ok: true };
}

export async function assign(conversationId: string, assigneeId: string | null): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "edit")) return { ok: false, error: "Нет прав" };
  await db.update(schema.conversations).set({ assigneeId }).where(eq(schema.conversations.id, conversationId));
  revalidatePath("/inbox");
  return { ok: true };
}

export async function setStatus(conversationId: string, status: "open" | "closed"): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "edit")) return { ok: false, error: "Нет прав" };
  await db.update(schema.conversations).set({ status, unread: 0 }).where(eq(schema.conversations.id, conversationId));
  revalidatePath("/inbox");
  return { ok: true };
}

export async function markRead(conversationId: string): Promise<void> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "view")) return;
  await db.update(schema.conversations).set({ unread: 0 }).where(and(eq(schema.conversations.id, conversationId)));
}

export async function createDealFromConversation(conversationId: string): Promise<R<{ dealId: string; number: number }>> {
  const user = await requireUser();
  if (!can(user.actor, "deals", "create")) return { ok: false, error: "Нет прав на создание сделок" };
  const c = await conv(conversationId);
  if (c.dealId) return { ok: false, error: "У переписки уже есть сделка" };
  const last = await db.query.messages.findFirst({ where: and(eq(schema.messages.conversationId, c.id), eq(schema.messages.direction, "in")), orderBy: (m, { desc }) => desc(m.createdAt) });
  const title = last ? last.text.slice(0, 60).replace(/\s+\S*$/, "") || `Заявка от ${c.peerName}` : `Заявка от ${c.peerName}`;
  let companyId = c.companyId;
  let contactId = c.contactId;
  if (!companyId) {
    // клиент не привязан — заводим карточку по данным переписки
    const { newId } = await import("@/lib/utils");
    companyId = newId("cmp");
    await db.insert(schema.companies).values({ id: companyId, name: c.peerName, shortName: c.peerName, status: "lead", source: `Переписка (${c.channel})`, managerId: user.id });
    contactId = newId("cnt");
    await db.insert(schema.contacts).values({ id: contactId, companyId, name: c.peerName, isPrimary: true, telegram: c.channel === "telegram" ? c.peerAddress : null, whatsapp: c.channel === "whatsapp" ? c.peerAddress : null, vk: c.channel === "vk" ? c.peerAddress : null, max: c.channel === "max" ? c.peerAddress : null, email: c.channel === "email" ? c.peerAddress : null, phone: c.channel === "sms" ? c.peerAddress : null });
    await db.update(schema.conversations).set({ companyId, contactId }).where(eq(schema.conversations.id, c.id));
  }
  const d = await createDealQuick({ title, companyId, contactId, managerId: user.id, source: `Переписка (${c.channel})`, userId: user.id });
  await db.update(schema.conversations).set({ dealId: d.id }).where(eq(schema.conversations.id, c.id));
  revalidatePath("/inbox");
  return { ok: true, dealId: d.id, number: d.number };
}

/** Демо: имитация входящего сообщения от клиента → автоматизации (ИИ-ответ) */
export async function simulateIncoming(p: { conversationId?: string | null; contactId?: string | null; channel?: Channel | null; text: string }): Promise<R<{ conversationId: string }>> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "edit")) return { ok: false, error: "Нет прав" };
  const text = p.text.trim();
  if (!text) return { ok: false, error: "Введите текст сообщения" };
  let channel: Channel;
  let address: string;
  let name: string;
  if (p.conversationId) {
    const c = await conv(p.conversationId);
    channel = c.channel; address = c.peerAddress; name = c.peerName;
  } else if (p.contactId && p.channel) {
    const ct = await db.query.contacts.findFirst({ where: eq(schema.contacts.id, p.contactId) });
    if (!ct) return { ok: false, error: "Контакт не найден" };
    const a = addressFor(ct, p.channel);
    if (!a) return { ok: false, error: `У контакта нет адреса для канала ${p.channel}` };
    channel = p.channel; address = a; name = ct.name;
  } else return { ok: false, error: "Выберите переписку или контакт" };
  const r = await receiveMessage({ channel, address, name, text, externalId: `demo_${Date.now()}` });
  await emit("message.received", { conversationId: r.conversationId, companyId: r.companyId, contactId: r.contactId, dealId: (await conv(r.conversationId)).dealId, text });
  revalidatePath("/inbox");
  return { ok: true, conversationId: r.conversationId };
}

function addressFor(ct: typeof schema.contacts.$inferSelect, channel: Channel): string | null {
  switch (channel) {
    case "telegram": return ct.telegram;
    case "whatsapp": return ct.whatsapp ?? ct.phone?.replace(/\D/g, "") ?? null;
    case "vk": return ct.vk;
    case "max": return ct.max;
    case "email": return ct.email;
    case "sms": return ct.phone;
    case "web": return ct.email ?? ct.phone;
  }
}

/** Новая переписка: менеджер первым пишет клиенту в выбранный канал */
export async function startConversation(p: { contactId: string; channel: Channel; text: string }): Promise<R<{ conversationId: string }>> {
  const user = await requireUser();
  if (!can(user.actor, "conversations", "create")) return { ok: false, error: "Нет прав" };
  const ct = await db.query.contacts.findFirst({ where: eq(schema.contacts.id, p.contactId) });
  if (!ct) return { ok: false, error: "Контакт не найден" };
  const address = addressFor(ct, p.channel);
  if (!address) return { ok: false, error: "У контакта нет адреса для этого канала" };
  const deal = ct.companyId ? await db.query.deals.findFirst({ where: and(eq(schema.deals.companyId, ct.companyId), eq(schema.deals.status, "open")) }) : null;
  const c = await findOrCreateConversation({ channel: p.channel, address, name: ct.name, companyId: ct.companyId, contactId: ct.id, dealId: deal?.id, assigneeId: user.id });
  const text = p.text.trim();
  if (text) {
    const r = await sendMessage({ conversationId: c.id, channel: p.channel, text, companyId: ct.companyId, contactId: ct.id, dealId: deal?.id, userId: user.id });
    if (!r.ok) return { ok: false, error: r.error ?? "Не удалось отправить" };
    await logActivity({ type: "message", title: `Сообщение в ${p.channel}: ${ct.name}`, body: text, dealId: deal?.id, companyId: ct.companyId, contactId: ct.id, userId: user.id, meta: { conversationId: c.id } });
  }
  revalidatePath("/inbox");
  return { ok: true, conversationId: c.id };
}
