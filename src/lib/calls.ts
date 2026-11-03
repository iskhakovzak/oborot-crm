import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { handleIncomingCallAi } from "./integrations/ai";
import { logActivity } from "./activity";
import { emit } from "./events";
import { newId } from "./utils";
import { createDealQuick } from "./telegram-bot";

export function normPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (!d) return "";
  const n = d.length === 11 && d.startsWith("8") ? "7" + d.slice(1) : d.length === 10 ? "7" + d : d;
  return "+" + n;
}

export async function resolvePeer(p: { phone?: string | null; contactId?: string | null }) {
  const contact = p.contactId
    ? await db.query.contacts.findFirst({ where: eq(schema.contacts.id, p.contactId) })
    : p.phone
      ? (await db.query.contacts.findMany()).find((c) => c.phone && normPhone(c.phone) === normPhone(p.phone!)) ?? null
      : null;
  const company = contact?.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, contact.companyId) }) : null;
  const deal = company ? await db.query.deals.findFirst({ where: and(eq(schema.deals.companyId, company.id), eq(schema.deals.status, "open")), orderBy: desc(schema.deals.updatedAt) }) : null;
  const phone = normPhone(p.phone ?? contact?.phone ?? "");
  return { contact: contact ?? null, company: company ?? null, deal: deal ?? null, phone };
}

/** Общая логика входящего звонка — используется демо-кнопкой и вебхуком телефонии */
export async function handleIncomingCall(p: {
  phone: string; contact: typeof schema.contacts.$inferSelect | null; company: typeof schema.companies.$inferSelect | null; deal: typeof schema.deals.$inferSelect | null;
  byAi: boolean; userId?: string | null; externalId?: string | null; provider?: string;
}): Promise<{ callId: string; status: "ai_handled" | "missed"; summary: string | null; sandbox: boolean }> {
  const id = newId("call");
  const base = { id, direction: "in" as const, phone: p.phone, contactId: p.contact?.id ?? null, companyId: p.company?.id ?? null, dealId: p.deal?.id ?? null, provider: p.provider ?? "sandbox", externalId: p.externalId ?? null };
  if (!p.byAi) {
    const managerId = p.company?.managerId ?? null;
    await db.insert(schema.calls).values({ ...base, userId: managerId, status: "missed", durationSec: 0 });
    await logActivity({ type: "call", title: "Пропущенный входящий звонок", body: p.phone, dealId: base.dealId, companyId: base.companyId, contactId: base.contactId, userId: managerId, meta: { callId: id } });
    await emit("call.missed", { callId: id, companyId: base.companyId, contactId: base.contactId, dealId: base.dealId, userId: managerId });
    return { callId: id, status: "missed", summary: null, sandbox: true };
  }
  const ai = await handleIncomingCallAi({ phone: p.phone, contactName: p.contact?.name ?? null, companyName: p.company?.name ?? null });
  const durationSec = 45 + Math.min(240, ai.transcript.split("\n").length * 14);
  await db.insert(schema.calls).values({ ...base, userId: null, status: "ai_handled", aiHandled: true, durationSec, transcript: ai.transcript, aiSummary: `${ai.summary}\nСледующий шаг: ${ai.nextStep}` });
  let companyId = base.companyId;
  let contactId = base.contactId;
  let dealId = base.dealId;
  if (ai.createLead) {
    if (!companyId) {
      // неизвестный номер — заводим карточку лида
      companyId = newId("cmp");
      const name = p.contact?.name ?? `Клиент ${p.phone}`;
      await db.insert(schema.companies).values({ id: companyId, name, shortName: name, phone: p.phone, status: "lead", source: "Входящий звонок", managerId: p.userId ?? null });
      contactId = newId("cnt");
      await db.insert(schema.contacts).values({ id: contactId, companyId, name, phone: p.phone, isPrimary: true });
    }
    const company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) }))!;
    const managerId = company.managerId ?? p.userId ?? (await db.query.users.findFirst({ where: and(eq(schema.users.isActive, true), eq(schema.users.acceptsLeads, true)) }))?.id ?? null;
    if (!dealId) {
      const d = await createDealQuick({ title: ai.summary.split(/[.:]/)[0].replace(/^Запрос\s*/i, "").trim().slice(0, 80) || "Заявка по звонку", companyId, contactId, managerId, source: "Входящий звонок (ИИ)", userId: p.userId });
      dealId = d.id;
    }
    await db.insert(schema.tasks).values({ id: newId("task"), title: `Отправить расчёт: ${company.name}`, description: `${ai.summary}\n\n${ai.nextStep}`, assigneeId: managerId, creatorId: p.userId ?? null, dealId, companyId, dueAt: new Date(Date.now() + 3600_000).toISOString(), priority: "high", source: "ai" });
    await db.update(schema.calls).set({ companyId, contactId, dealId }).where(eq(schema.calls.id, id));
  }
  await logActivity({ type: "call", title: "Входящий звонок принял ИИ", body: ai.summary, dealId, companyId, contactId, meta: { callId: id, durationSec } });
  await logActivity({ type: "ai", title: ai.createLead ? "ИИ создал заявку по звонку и поставил задачу менеджеру" : "ИИ обработал звонок", body: `${ai.nextStep}${ai.sandbox ? " (демо-режим)" : ""}`, dealId, companyId, contactId, meta: { callId: id } });
  return { callId: id, status: "ai_handled", summary: ai.summary, sandbox: ai.sandbox };
}
