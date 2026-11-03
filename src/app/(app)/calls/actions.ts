"use server";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { placeCall, completeCall } from "@/lib/integrations/telephony";
import { emit } from "@/lib/events";
import { handleIncomingCall, resolvePeer } from "@/lib/calls";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function callAction(p: { phone?: string; contactId?: string | null }): Promise<R<{ status: string; sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "calls", "create")) return { ok: false, error: "Нет прав на звонки" };
  const peer = await resolvePeer(p);
  if (!peer.phone) return { ok: false, error: "Укажите номер телефона" };
  const r = await placeCall({ phone: peer.phone, userId: user.id, contactId: peer.contact?.id, companyId: peer.company?.id, dealId: peer.deal?.id });
  revalidatePath("/calls");
  return { ok: true, status: r.status, sandbox: r.sandbox };
}

export async function setCallStatus(id: string, p: { status: "completed" | "missed" | "busy"; durationSec?: number }): Promise<R> {
  const user = await requireUser();
  if (!can(user.actor, "calls", "edit")) return { ok: false, error: "Нет прав" };
  const call = await db.query.calls.findFirst({ where: eq(schema.calls.id, id) });
  if (!call) return { ok: false, error: "Звонок не найден" };
  await completeCall(id, { status: p.status, durationSec: p.durationSec ?? (p.status === "completed" ? Math.max(30, call.durationSec || 90) : 0), recordingUrl: call.recordingUrl, transcript: call.transcript, aiSummary: call.aiSummary });
  if (p.status === "missed" && call.direction === "in") await emit("call.missed", { callId: id, companyId: call.companyId, contactId: call.contactId, dealId: call.dealId, userId: call.userId });
  revalidatePath("/calls");
  return { ok: true };
}

/** Демо: входящий звонок. ИИ принимает → ai_handled с транскриптом и резюме; иначе — пропущенный + событие call.missed */
export async function simulateIncomingCall(p: { phone?: string; contactId?: string | null; byAi: boolean }): Promise<R<{ callId: string; status: string; summary: string | null; sandbox: boolean }>> {
  const user = await requireUser();
  if (!can(user.actor, "calls", "create")) return { ok: false, error: "Нет прав" };
  const peer = await resolvePeer(p);
  if (!peer.phone) return { ok: false, error: "Укажите номер телефона" };
  const r = await handleIncomingCall({ phone: peer.phone, contact: peer.contact, company: peer.company, deal: peer.deal, byAi: p.byAi, userId: user.id, externalId: `demo_${Date.now()}` });
  revalidatePath("/calls");
  revalidatePath("/tasks");
  return { ok: true, ...r };
}
