import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Channel } from "@/db/schema";
import { receiveMessage } from "@/lib/integrations/messaging";
import { resolve, logEvent } from "@/lib/integrations/registry";
import { getSetting } from "@/lib/settings";
import { emit } from "@/lib/events";
import { handleIncomingCall, resolvePeer } from "@/lib/calls";

export const dynamic = "force-dynamic";

const PROVIDERS = ["telegram", "whatsapp", "vk", "max", "email", "telephony"] as const;
type Provider = (typeof PROVIDERS)[number];
type Json = Record<string, unknown>;
type Inbound = { address: string; name: string; text: string; externalId?: string; attachments?: { name: string; url: string }[] };

const str = (v: unknown) => (v == null ? "" : String(v));
const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Json)[k] : undefined), o);

async function readBody(req: Request): Promise<Json> {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) return (await req.json()) as Json;
    const raw = await req.text();
    if (!raw) return {};
    if (ct.includes("form")) {
      const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
      // Mango Office присылает поле json со вложенным JSON
      if (params.json) { try { return { ...params, ...(JSON.parse(params.json) as Json) }; } catch { return params; } }
      return params;
    }
    try { return JSON.parse(raw) as Json; } catch { return { raw }; }
  } catch {
    return {};
  }
}

/** Приводит payload провайдера к единому входящему сообщению */
function normalize(provider: Provider, b: Json): Inbound | null {
  // универсальный формат для интеграций-посредников
  if (typeof b.address === "string" && typeof b.text === "string") return { address: b.address, name: str(b.name) || b.address, text: b.text, externalId: str(b.externalId) || undefined };
  switch (provider) {
    case "telegram": {
      const m = (b.message ?? b.edited_message) as Json | undefined;
      if (!m) return null;
      const chat = (m.chat ?? {}) as Json;
      const from = (m.from ?? {}) as Json;
      const text = str(m.text ?? m.caption);
      if (!text && !m.document && !m.photo) return null;
      const name = [from.first_name ?? chat.first_name, from.last_name ?? chat.last_name].filter(Boolean).join(" ") || str(from.username ?? chat.username) || `Telegram ${chat.id}`;
      const doc = m.document as Json | undefined;
      return { address: str(chat.id), name, text: text || (doc ? `[файл] ${str(doc.file_name)}` : "[фото]"), externalId: str(m.message_id) || undefined, attachments: doc ? [{ name: str(doc.file_name) || "файл", url: `tg-file://${str(doc.file_id)}` }] : [] };
    }
    case "whatsapp": {
      // Green API
      if (b.typeWebhook && b.typeWebhook !== "incomingMessageReceived") return null;
      const chatId = str(get(b, "senderData.chatId") ?? get(b, "senderData.sender") ?? b.from);
      if (!chatId) return null;
      const text = str(get(b, "messageData.textMessageData.textMessage") ?? get(b, "messageData.extendedTextMessageData.text") ?? get(b, "messageData.fileMessageData.caption") ?? b.text ?? b.body);
      const file = get(b, "messageData.fileMessageData") as Json | undefined;
      return { address: chatId.replace(/@.*$/, ""), name: str(get(b, "senderData.senderName") ?? get(b, "senderData.chatName")) || chatId.replace(/@.*$/, ""), text: text || (file ? `[файл] ${str(file.fileName)}` : ""), externalId: str(b.idMessage) || undefined, attachments: file?.downloadUrl ? [{ name: str(file.fileName) || "файл", url: str(file.downloadUrl) }] : [] };
    }
    case "vk": {
      if (b.type !== "message_new") return null;
      const m = (get(b, "object.message") ?? b.object) as Json | undefined;
      if (!m) return null;
      const peer = str(m.peer_id ?? m.from_id ?? m.user_id);
      return { address: peer, name: `ВКонтакте id${peer}`, text: str(m.text ?? m.body), externalId: str(m.conversation_message_id ?? m.id) || undefined };
    }
    case "max": {
      if (b.update_type && b.update_type !== "message_created") return null;
      const m = (b.message ?? {}) as Json;
      const sender = (m.sender ?? {}) as Json;
      const body = (m.body ?? {}) as Json;
      const address = str(get(m, "recipient.chat_id") ?? sender.user_id);
      if (!address) return null;
      return { address, name: str(sender.name) || `MAX ${address}`, text: str(body.text), externalId: str(body.mid) || undefined };
    }
    case "email": {
      const fromRaw = str(b.from ?? b.sender ?? get(b, "envelope.from") ?? b.From);
      const m = fromRaw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
      const address = (m ? m[2] : fromRaw).trim().toLowerCase();
      if (!address) return null;
      const name = (m?.[1] ?? str(b.fromName ?? b.from_name)).trim() || address;
      const subject = str(b.subject ?? b.Subject);
      const text = str(b.text ?? b["body-plain"] ?? b["stripped-text"] ?? b.body ?? b.html).trim();
      const atts = Array.isArray(b.attachments) ? (b.attachments as Json[]).filter((a) => a.url).map((a) => ({ name: str(a.name ?? a.filename) || "вложение", url: str(a.url) })) : [];
      return { address, name, text: subject ? `${subject}\n\n${text}` : text, externalId: str(b.messageId ?? b["Message-Id"] ?? b.id) || undefined, attachments: atts };
    }
    case "telephony":
      return null;
  }
}

/** Входящий звонок из АТС (Mango, Zadarma, UIS или универсальный формат) */
async function telephony(b: Json) {
  const event = str(b.event ?? b.call_state ?? b.type ?? b.state).toLowerCase();
  const direction = str(b.direction ?? (b.location === "ivr" ? "in" : "")).toLowerCase();
  // Zadarma: NOTIFY_START (входящий), NOTIFY_END; Mango: call_state Appeared/Connected/Disconnected
  const isIncoming = /notify_start|appeared|incoming|ringing|new_call/.test(event) || direction === "in" || direction === "inbound" || (!event && !direction);
  if (/notify_end|disconnected|hangup|end/.test(event) && !isIncoming) return { ok: true, skipped: "end-of-call" };
  if (!isIncoming) return { ok: true, skipped: "outgoing" };
  const phone = str(b.phone ?? b.caller_id ?? b.caller_number ?? b.from_number ?? get(b, "from.number") ?? b.caller ?? b.contact_phone);
  if (!phone) return { ok: false, error: "no caller number" };
  const externalId = str(b.externalId ?? b.call_id ?? b.pbx_call_id ?? b.entry_id ?? b.id) || undefined;
  const existing = externalId ? await db.query.calls.findFirst({ where: eq(schema.calls.externalId, externalId) }) : null;
  if (existing) return { ok: true, callId: existing.id, duplicate: true };
  const ai = await getSetting("ai");
  const tel = await resolve("telephony");
  const peer = await resolvePeer({ phone });
  const r = await handleIncomingCall({ phone: peer.phone || phone, contact: peer.contact, company: peer.company, deal: peer.deal, byAi: ai.callsEnabled, externalId, provider: tel.live ? tel.provider : "sandbox" });
  return { ok: true, callId: r.callId, status: r.status, summary: r.summary };
}

export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await ctx.params;
  if (!PROVIDERS.includes(provider as Provider)) return NextResponse.json({ ok: false, error: "unknown provider" }, { status: 404 });
  const p = provider as Provider;
  const body = await readBody(req);
  await logEvent({ kind: "webhook.receive", provider: p, direction: "in", payload: body });

  if (p === "vk") {
    const r = await resolve("messenger", "vk");
    if (body.type === "confirmation") {
      const ok = !r.config.groupId || str(body.group_id) === r.config.groupId;
      await logEvent({ kind: "webhook.confirmation", provider: "vk", direction: "out", payload: { groupId: body.group_id, ok }, status: ok ? "ok" : "error", integrationId: r.integrationId });
      return new Response(ok ? r.config.confirmationCode || r.config.confirmation || "ok" : "forbidden", { status: ok ? 200 : 403, headers: { "content-type": "text/plain" } });
    }
    if (r.config.groupId && body.group_id != null && str(body.group_id) !== r.config.groupId) return new Response("ok");
    if (r.config.secret && body.secret !== r.config.secret) return new Response("ok");
  }

  if (p === "telephony") {
    const r = await telephony(body);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  const inbound = normalize(p, body);
  if (!inbound || !inbound.address) {
    const res = { ok: true, skipped: true };
    return p === "vk" ? new Response("ok") : NextResponse.json(res);
  }
  const channel: Channel = p;
  const got = await receiveMessage({ channel, address: inbound.address, name: inbound.name, text: inbound.text || "[пустое сообщение]", externalId: inbound.externalId, attachments: inbound.attachments });
  const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, got.conversationId) });
  const runs = await emit("message.received", { conversationId: got.conversationId, companyId: got.companyId, contactId: got.contactId, dealId: conv?.dealId ?? null, text: inbound.text });
  if (p === "vk") return new Response("ok");
  return NextResponse.json({ ok: true, conversationId: got.conversationId, messageId: got.messageId, automations: runs.map((x) => ({ status: x.status, log: x.log })) });
}

export async function GET(_req: Request, ctx: RouteContext<"/api/webhooks/[provider]">) {
  const { provider } = await ctx.params;
  if (!PROVIDERS.includes(provider as Provider)) return NextResponse.json({ ok: false, error: "unknown provider" }, { status: 404 });
  return NextResponse.json({ ok: true, provider, method: "POST", hint: "Укажите этот адрес в настройках вебхука провайдера" });
}
