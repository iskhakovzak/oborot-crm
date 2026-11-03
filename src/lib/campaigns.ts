import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./utils";
import { sendMessage } from "./integrations/messaging";
import { sendEmail } from "./integrations/email";
import { sendSms } from "./integrations/sms";
import { buildContext, render } from "./automations/templates";
import { logActivity } from "./activity";

/** 28. Рассылки в мессенджеры, на email и SMS по сегменту клиентов */

import { CHANNEL_LABEL, type CampaignChannel, type Segment } from "@/components/campaigns/constants";
export { CHANNEL_LABEL, COMPANY_STATUS_LABEL, type CampaignChannel, type Segment } from "@/components/campaigns/constants";
export type Recipient = { companyId: string; companyName: string; contactId: string | null; contactName: string; address: string };

/** Адрес получателя в выбранном канале: основной контакт компании, для email/sms — запасной вариант из карточки компании */
function addressFor(channel: CampaignChannel, contact: typeof schema.contacts.$inferSelect | undefined, company: typeof schema.companies.$inferSelect): string | null {
  switch (channel) {
    case "telegram": return contact?.telegram ?? null;
    case "whatsapp": return contact?.whatsapp ?? null;
    case "max": return contact?.max ?? null;
    case "instagram": return contact?.instagram ?? null;
    case "email": return contact?.email ?? company.email ?? null;
    case "sms": return contact?.phone ?? company.phone ?? null;
  }
}

/** Получатели по сегменту: компании по фильтру → основной контакт с адресом в канале */
export async function segmentRecipients(segment: Segment, channel: CampaignChannel): Promise<Recipient[]> {
  const companies = await db.select().from(schema.companies);
  const lc = (xs?: string[]) => (xs ?? []).map((x) => x.toLowerCase());
  const tags = lc(segment.tags), sources = lc(segment.source);
  const filtered = companies.filter((c) => {
    if (segment.status?.length && !segment.status.includes(c.status)) return false;
    if (segment.managerIds?.length && (!c.managerId || !segment.managerIds.includes(c.managerId))) return false;
    if (sources.length && !sources.includes((c.source ?? "").toLowerCase())) return false;
    if (tags.length && !(c.tags ?? []).some((t) => tags.includes(t.toLowerCase()))) return false;
    return true;
  });
  if (!filtered.length) return [];
  const contacts = await db.select().from(schema.contacts).where(inArray(schema.contacts.companyId, filtered.map((c) => c.id)));
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const c of filtered) {
    const mine = contacts.filter((k) => k.companyId === c.id);
    const contact = mine.find((k) => k.isPrimary && addressFor(channel, k, c)) ?? mine.find((k) => addressFor(channel, k, c)) ?? mine[0];
    const address = addressFor(channel, contact, c);
    if (!address || seen.has(address)) continue;
    seen.add(address);
    out.push({ companyId: c.id, companyName: c.shortName ?? c.name, contactId: contact?.id ?? null, contactName: contact?.name ?? c.name, address });
  }
  return out;
}

export async function previewSegment(segment: Segment, channel: CampaignChannel): Promise<{ count: number; names: string[] }> {
  const r = await segmentRecipients(segment, channel);
  return { count: r.length, names: r.slice(0, 5).map((x) => `${x.contactName} (${x.companyName})`) };
}

const emptyStats = () => ({ total: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 });

/** Отправка рассылки: доставки по получателям, подстановка шаблона, отправка в канал, статистика */
export async function sendCampaign(campaignId: string, userId: string | null) {
  const c = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, campaignId) });
  if (!c) throw new Error("Рассылка не найдена");
  if (c.status === "sent" || c.status === "sending") throw new Error("Рассылка уже отправлена");
  const recipients = await segmentRecipients(c.segment ?? {}, c.channel);
  await db.update(schema.campaigns).set({ status: "sending", stats: { ...emptyStats(), total: recipients.length } }).where(eq(schema.campaigns.id, campaignId));
  await db.delete(schema.campaignDeliveries).where(eq(schema.campaignDeliveries.campaignId, campaignId));

  const stats = { ...emptyStats(), total: recipients.length };
  let sandbox = false;
  const now = new Date().toISOString();
  for (const [i, r] of recipients.entries()) {
    const id = newId("cdl");
    const ctx = await buildContext({ companyId: r.companyId, contactId: r.contactId });
    const text = render(c.body, ctx);
    let ok = false, isSandbox = false, error: string | undefined;
    try {
      if (c.channel === "email") {
        const res = await sendEmail({ to: r.address, subject: render(c.subject ?? c.name, ctx), text });
        ok = res.ok; isSandbox = res.sandbox; error = res.error;
      } else if (c.channel === "sms") {
        const res = await sendSms(r.address, text);
        ok = res.ok; isSandbox = res.sandbox; error = res.error;
      } else {
        const res = await sendMessage({ channel: c.channel, to: r.address, text, companyId: r.companyId, contactId: r.contactId, userId, isAutomation: true });
        ok = res.ok; isSandbox = res.sandbox; error = res.error;
      }
    } catch (e) { ok = false; error = String(e); }
    sandbox ||= isSandbox;
    // в демо-режиме имитируем доставку, открытия и клики, чтобы статистика была наглядной
    let status: (typeof schema.campaignDeliveries.$inferSelect)["status"] = ok ? "sent" : "failed";
    let openedAt: string | null = null, clickedAt: string | null = null;
    if (ok && isSandbox) {
      status = "delivered";
      if (i % 10 !== 9) { status = "opened"; openedAt = now; }
      if (i % 3 === 0 && status === "opened") { status = "clicked"; clickedAt = now; }
    }
    if (ok) stats.sent++;
    if (status === "failed") stats.failed++;
    if (status === "delivered" || status === "opened" || status === "clicked") stats.delivered++;
    if (status === "opened" || status === "clicked") stats.opened++;
    if (status === "clicked") stats.clicked++;
    await db.insert(schema.campaignDeliveries).values({ id, campaignId, contactId: r.contactId, companyId: r.companyId, address: r.address, status, error: error ?? null, sentAt: ok ? now : null, openedAt, clickedAt });
    if (ok) await logActivity({ type: "message", title: `Рассылка «${c.name}» (${CHANNEL_LABEL[c.channel]})`, body: text, companyId: r.companyId, contactId: r.contactId, userId, meta: { campaignId } });
  }
  await db.update(schema.campaigns).set({ status: "sent", sentAt: now, stats }).where(eq(schema.campaigns.id, campaignId));
  return { stats, sandbox };
}
