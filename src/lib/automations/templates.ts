import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtMoney, fmtDateLong } from "@/lib/format";

export type TemplateContext = {
  client: { name: string; shortName: string; inn: string; phone: string; email: string };
  contact: { name: string; firstName: string; phone: string };
  deal: { title: string; number: string; amount: string; stage: string; manager: string; nextStep: string };
  invoice: { number: string; amount: string; link: string };
  payment: { amount: string; date: string };
  company: { name: string; phone: string; email: string };
  booking: { date: string; time: string; title: string };
  link: { pay: string; booking: string };
};

export async function buildContext(p: { dealId?: string | null; companyId?: string | null; contactId?: string | null; documentId?: string | null; paymentId?: string | null; bookingId?: string | null; payUrl?: string | null }): Promise<TemplateContext> {
  const { getSetting, appUrl } = await import("@/lib/settings");
  const profile = await getSetting("company");
  const deal = p.dealId ? await db.query.deals.findFirst({ where: eq(schema.deals.id, p.dealId) }) : null;
  const companyId = p.companyId ?? deal?.companyId ?? null;
  const company = companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, companyId) }) : null;
  const contactId = p.contactId ?? deal?.contactId ?? null;
  const contact = contactId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) }) : companyId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.companyId, companyId) }) : null;
  const stage = deal ? await db.query.stages.findFirst({ where: eq(schema.stages.id, deal.stageId) }) : null;
  const manager = deal?.managerId ? await db.query.users.findFirst({ where: eq(schema.users.id, deal.managerId) }) : null;
  const doc = p.documentId ? await db.query.documents.findFirst({ where: eq(schema.documents.id, p.documentId) }) : null;
  const payment = p.paymentId ? await db.query.payments.findFirst({ where: eq(schema.payments.id, p.paymentId) }) : null;
  const booking = p.bookingId ? await db.query.bookings.findFirst({ where: eq(schema.bookings.id, p.bookingId) }) : null;
  const firstName = contact?.name?.split(" ").find((w, i) => i === 1) ?? contact?.name?.split(" ")[0] ?? "";
  return {
    client: { name: company?.name ?? contact?.name ?? "клиент", shortName: company?.shortName ?? company?.name ?? "", inn: company?.inn ?? "", phone: company?.phone ?? "", email: company?.email ?? "" },
    contact: { name: contact?.name ?? "", firstName, phone: contact?.phone ?? "" },
    deal: { title: deal?.title ?? "", number: deal ? String(deal.number) : "", amount: fmtMoney(deal?.amount), stage: stage?.name ?? "", manager: manager?.name ?? "", nextStep: deal?.nextStep ?? "" },
    invoice: { number: doc?.number ?? "", amount: fmtMoney(doc?.amount), link: doc ? appUrl(`/api/documents/${doc.id}/pdf`) : "" },
    payment: { amount: fmtMoney(payment?.amount), date: fmtDateLong(payment?.paidAt) },
    company: { name: profile.shortName, phone: profile.phone, email: profile.email },
    booking: { date: booking ? fmtDateLong(booking.startsAt) : "", time: booking ? new Date(booking.startsAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "", title: booking?.title ?? "" },
    link: { pay: p.payUrl ?? "", booking: appUrl("/book") },
  };
}

/** Подстановка {{client.name}}, {{deal.amount}} и т.п. */
export function render(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const v = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), ctx);
    return v == null ? "" : String(v);
  });
}

export const TEMPLATE_VARS = [
  "client.name", "client.shortName", "client.inn", "contact.name", "contact.firstName", "contact.phone", "deal.title", "deal.number", "deal.amount", "deal.stage", "deal.manager", "deal.nextStep",
  "invoice.number", "invoice.amount", "invoice.link", "payment.amount", "payment.date", "company.name", "company.phone", "booking.date", "booking.time", "link.pay", "link.booking",
];
