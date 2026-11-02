import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Channel } from "@/db/schema";
import { newId } from "@/lib/utils";
import { resolve, logEvent } from "./registry";
import { sendSms } from "./sms";
import { sendEmail } from "./email";

export type SendArgs = {
  channel: Channel | "preferred";
  to?: string;
  text: string;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  userId?: string | null;
  isAi?: boolean;
  isAutomation?: boolean;
  conversationId?: string | null;
  attachments?: { name: string; url: string }[];
};

/** Выбирает канал: где с клиентом уже была переписка, иначе по заполненным контактам */
export async function preferredChannel(contactId?: string | null, companyId?: string | null): Promise<{ channel: Channel; address: string; name: string } | null> {
  if (contactId || companyId) {
    const conv = await db.query.conversations.findFirst({
      where: contactId ? eq(schema.conversations.contactId, contactId) : eq(schema.conversations.companyId, companyId!),
      orderBy: desc(schema.conversations.lastMessageAt),
    });
    if (conv) return { channel: conv.channel, address: conv.peerAddress, name: conv.peerName };
  }
  const contact = contactId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) }) : companyId ? await db.query.contacts.findFirst({ where: and(eq(schema.contacts.companyId, companyId), eq(schema.contacts.isPrimary, true)) }) ?? await db.query.contacts.findFirst({ where: eq(schema.contacts.companyId, companyId) }) : null;
  if (!contact) {
    const company = companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) }) : null;
    if (company?.email) return { channel: "email", address: company.email, name: company.name };
    if (company?.phone) return { channel: "sms", address: company.phone, name: company.name };
    return null;
  }
  if (contact.telegram) return { channel: "telegram", address: contact.telegram, name: contact.name };
  if (contact.whatsapp) return { channel: "whatsapp", address: contact.whatsapp, name: contact.name };
  if (contact.max) return { channel: "max", address: contact.max, name: contact.name };
  if (contact.vk) return { channel: "vk", address: contact.vk, name: contact.name };
  if (contact.email) return { channel: "email", address: contact.email, name: contact.name };
  if (contact.phone) return { channel: "sms", address: contact.phone, name: contact.name };
  return null;
}

export async function findOrCreateConversation(p: { channel: Channel; address: string; name: string; companyId?: string | null; contactId?: string | null; dealId?: string | null; externalId?: string | null; assigneeId?: string | null }) {
  const existing = await db.query.conversations.findFirst({ where: and(eq(schema.conversations.channel, p.channel), eq(schema.conversations.peerAddress, p.address)) });
  if (existing) return existing;
  const id = newId("conv");
  await db.insert(schema.conversations).values({ id, channel: p.channel, peerAddress: p.address, peerName: p.name, companyId: p.companyId ?? null, contactId: p.contactId ?? null, dealId: p.dealId ?? null, externalId: p.externalId ?? null, assigneeId: p.assigneeId ?? null });
  return (await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) }))!;
}

/** Исходящее сообщение клиенту в любой канал. Запись в переписку + доставка через провайдера (или демо-режим). */
export async function sendMessage(a: SendArgs): Promise<{ ok: boolean; sandbox: boolean; messageId: string | null; conversationId: string | null; channel: Channel | null; error?: string }> {
  let channel: Channel | null = a.channel === "preferred" ? null : a.channel;
  let address = a.to ?? null;
  let name = "Клиент";
  if (a.conversationId) {
    const c = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, a.conversationId) });
    if (c) { channel = c.channel; address = c.peerAddress; name = c.peerName; }
  }
  if (!channel || !address) {
    const pref = await preferredChannel(a.contactId, a.companyId);
    if (!pref) return { ok: false, sandbox: false, messageId: null, conversationId: null, channel: null, error: "У клиента нет контактов для связи" };
    channel = channel ?? pref.channel;
    address = address ?? pref.address;
    name = pref.name;
  } else if (a.contactId) {
    const c = await db.query.contacts.findFirst({ where: eq(schema.contacts.id, a.contactId) });
    if (c) name = c.name;
  }
  const conv = await findOrCreateConversation({ channel, address, name, companyId: a.companyId, contactId: a.contactId, dealId: a.dealId, assigneeId: a.userId });
  const msgId = newId("msg");
  let delivery: { ok: boolean; sandbox: boolean; externalId?: string; error?: string } = { ok: true, sandbox: true };
  if (channel === "sms") delivery = await sendSms(address, a.text);
  else if (channel === "email") { const r = await sendEmail({ to: address, subject: "Сообщение от компании", text: a.text }); delivery = { ok: r.ok, sandbox: r.sandbox, externalId: r.messageId, error: r.error }; }
  else delivery = await deliverMessenger(channel, address, a.text);
  await db.insert(schema.messages).values({ id: msgId, conversationId: conv.id, direction: "out", text: a.text, attachments: a.attachments ?? [], authorUserId: a.userId ?? null, isAi: !!a.isAi, isAutomation: !!a.isAutomation, externalId: delivery.externalId ?? null, status: delivery.ok ? "sent" : "failed" });
  await db.update(schema.conversations).set({ lastMessageAt: new Date().toISOString(), status: "open" }).where(eq(schema.conversations.id, conv.id));
  return { ok: delivery.ok, sandbox: delivery.sandbox, messageId: msgId, conversationId: conv.id, channel, error: delivery.error };
}

async function deliverMessenger(channel: Channel, address: string, text: string): Promise<{ ok: boolean; sandbox: boolean; externalId?: string; error?: string }> {
  const r = await resolve("messenger", channel);
  try {
    if (r.live && channel === "telegram" && r.config.botToken && /^-?\d+$/.test(address)) {
      const res = await fetch(`https://api.telegram.org/bot${r.config.botToken}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: address, text }) });
      const j = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
      await logEvent({ kind: "message.send", provider: "telegram", direction: "out", payload: { to: address, text, response: j }, status: j.ok ? "ok" : "error", integrationId: r.integrationId });
      return { ok: j.ok, sandbox: false, externalId: j.result ? String(j.result.message_id) : undefined, error: j.description };
    }
    if (r.live && channel === "whatsapp" && r.config.instanceId) {
      const chatId = address.includes("@") ? address : `${address.replace(/\D/g, "")}@c.us`;
      const res = await fetch(`https://api.green-api.com/waInstance${r.config.instanceId}/sendMessage/${r.config.apiToken}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId, message: text }) });
      const j = (await res.json()) as { idMessage?: string };
      await logEvent({ kind: "message.send", provider: "whatsapp", direction: "out", payload: { to: chatId, text, response: j }, status: j.idMessage ? "ok" : "error", integrationId: r.integrationId });
      return { ok: !!j.idMessage, sandbox: false, externalId: j.idMessage };
    }
    if (r.live && channel === "vk" && r.config.groupToken) {
      const params = new URLSearchParams({ access_token: r.config.groupToken, v: "5.199", peer_id: address, message: text, random_id: String(Date.now()) });
      const res = await fetch(`https://api.vk.com/method/messages.send?${params}`);
      const j = (await res.json()) as { response?: number; error?: { error_msg: string } };
      await logEvent({ kind: "message.send", provider: "vk", direction: "out", payload: { to: address, text, response: j }, status: j.error ? "error" : "ok", integrationId: r.integrationId });
      return { ok: !j.error, sandbox: false, externalId: j.response ? String(j.response) : undefined, error: j.error?.error_msg };
    }
    if (r.live && channel === "max" && r.config.botToken) {
      const res = await fetch(`https://botapi.max.ru/messages?chat_id=${encodeURIComponent(address)}`, { method: "POST", headers: { "content-type": "application/json", Authorization: r.config.botToken }, body: JSON.stringify({ text }) });
      const j = (await res.json()) as { message?: { body?: { mid?: string } } };
      await logEvent({ kind: "message.send", provider: "max", direction: "out", payload: { to: address, text, response: j }, status: res.ok ? "ok" : "error", integrationId: r.integrationId });
      return { ok: res.ok, sandbox: false, externalId: j.message?.body?.mid };
    }
  } catch (e) {
    await logEvent({ kind: "message.send", provider: channel, direction: "out", payload: { to: address, text, error: String(e) }, status: "error", integrationId: r.integrationId });
    return { ok: false, sandbox: false, error: String(e) };
  }
  await logEvent({ kind: "message.send", provider: channel, direction: "out", payload: { to: address, text }, status: "sandbox", integrationId: r.integrationId });
  return { ok: true, sandbox: true, externalId: `sandbox_${Date.now()}` };
}

/** Входящее сообщение из вебхука провайдера или из демо-симулятора */
export async function receiveMessage(p: { channel: Channel; address: string; name: string; text: string; externalId?: string; attachments?: { name: string; url: string }[] }) {
  // пробуем найти контакт по адресу
  const contact = await db.query.contacts.findFirst({
    where: (c, { or, eq }) => or(eq(c.telegram, p.address), eq(c.whatsapp, p.address), eq(c.vk, p.address), eq(c.max, p.address), eq(c.email, p.address), eq(c.phone, p.address)),
  });
  const conv = await findOrCreateConversation({ channel: p.channel, address: p.address, name: contact?.name ?? p.name, companyId: contact?.companyId ?? null, contactId: contact?.id ?? null, externalId: p.externalId });
  const msgId = newId("msg");
  await db.insert(schema.messages).values({ id: msgId, conversationId: conv.id, direction: "in", text: p.text, attachments: p.attachments ?? [], externalId: p.externalId ?? null, status: "delivered" });
  await db.update(schema.conversations).set({ lastMessageAt: new Date().toISOString(), unread: conv.unread + 1, status: "open" }).where(eq(schema.conversations.id, conv.id));
  await logEvent({ kind: "message.receive", provider: p.channel, direction: "in", payload: { from: p.address, text: p.text } });
  return { conversationId: conv.id, messageId: msgId, contactId: contact?.id ?? null, companyId: contact?.companyId ?? null };
}
