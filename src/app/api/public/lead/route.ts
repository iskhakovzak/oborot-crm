import { NextResponse } from "next/server";
import { asc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "@/lib/utils";
import { nextNumber } from "@/lib/counters";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";
import { pickManager } from "@/lib/distribution";
import { validateInn } from "@/lib/integrations/company-data";
import type { Utm } from "@/db/schema";

type LeadBody = { name?: string; phone?: string; email?: string; company?: string; inn?: string; message?: string; source?: string; utm?: Utm; ymClientId?: string };

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const digits = (v: string) => v.replace(/\D/g, "");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** 25 + 27. Публичный приём заявок с сайта/лендинга: компания + контакт + сделка в первой стадии продаж, менеджер — по правилам распределения, UTM и ClientID Метрики сохраняются */
export async function POST(req: Request) {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Ожидается JSON" }, { status: 400, headers: CORS });
  }
  const name = str(body.name, 200);
  const phoneRaw = str(body.phone, 40);
  const phone = digits(phoneRaw);
  const email = str(body.email, 200).toLowerCase();
  const companyName = str(body.company, 300);
  const inn = digits(str(body.inn, 20));
  const message = str(body.message, 4000);
  const source = str(body.source, 100) || "Сайт";
  const ymClientId = str(body.ymClientId, 100) || null;
  const utmRaw = body.utm && typeof body.utm === "object" ? body.utm : {};
  const utm: Utm = Object.fromEntries((["source", "medium", "campaign", "content", "term"] as const).map((k) => [k, str((utmRaw as Record<string, unknown>)[k], 200)]).filter(([, v]) => v));
  if (!name && !phone && !email) return NextResponse.json({ ok: false, error: "Укажите имя и телефон или email" }, { status: 400, headers: CORS });
  if (phoneRaw && phone.length < 10) return NextResponse.json({ ok: false, error: "Некорректный телефон" }, { status: 400, headers: CORS });
  if (inn && !validateInn(inn)) return NextResponse.json({ ok: false, error: "Некорректный ИНН" }, { status: 400, headers: CORS });

  try {
    const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, "sales") });
    if (!pipeline) return NextResponse.json({ ok: false, error: "Воронка продаж не настроена" }, { status: 500, headers: CORS });
    const stage = await db.query.stages.findFirst({ where: eq(schema.stages.pipelineId, pipeline.id), orderBy: asc(schema.stages.order) });
    if (!stage) return NextResponse.json({ ok: false, error: "В воронке нет этапов" }, { status: 500, headers: CORS });

    // 1. Компания: по ИНН → по телефону контакта/компании → по email → новая
    let company = inn ? await db.query.companies.findFirst({ where: eq(schema.companies.inn, inn) }) : undefined;
    let contact: typeof schema.contacts.$inferSelect | undefined;
    const samePhone = (v: string | null) => digits(v ?? "").endsWith(phone.slice(-10));
    if (!company && phone) {
      // телефоны хранятся в разном формате — сравниваем по цифрам среди кандидатов с теми же последними двумя цифрами
      contact = (await db.query.contacts.findMany({ where: ilike(schema.contacts.phone, `%${phone.slice(-2)}`) })).find((c) => samePhone(c.phone));
      if (contact?.companyId) company = await db.query.companies.findFirst({ where: eq(schema.companies.id, contact.companyId) });
      if (!company) company = (await db.query.companies.findMany({ where: ilike(schema.companies.phone, `%${phone.slice(-2)}`) })).find((c) => samePhone(c.phone));
    }
    if (!company && email) {
      contact = contact ?? (await db.query.contacts.findFirst({ where: eq(schema.contacts.email, email) }));
      if (contact?.companyId) company = await db.query.companies.findFirst({ where: eq(schema.companies.id, contact.companyId) });
      if (!company) company = await db.query.companies.findFirst({ where: eq(schema.companies.email, email) });
    }
    const isNewCompany = !company;
    const managerId = company?.managerId ?? (await pickManager({ source, tags: company?.tags ?? null })) ?? null;
    if (!company) {
      const id = newId("cmp");
      const cname = companyName || name || `Клиент ${phoneRaw || email}`;
      await db.insert(schema.companies).values({ id, name: cname, inn: inn || null, phone: phone ? `+${phone}` : null, email: email || null, status: "lead", source, utm: Object.keys(utm).length ? utm : null, managerId });
      company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, id) }))!;
      await logActivity({ type: "system", title: `Клиент создан из заявки с сайта (${source})`, companyId: id, userId: managerId });
    } else if (company.managerId !== managerId && managerId) {
      await db.update(schema.companies).set({ managerId }).where(eq(schema.companies.id, company.id));
    }

    // 2. Контакт
    if (!contact) {
      contact = (await db.query.contacts.findMany({ where: eq(schema.contacts.companyId, company.id) })).find((c) => (phone && samePhone(c.phone)) || (email && c.email?.toLowerCase() === email));
    }
    if (!contact) {
      const id = newId("cnt");
      const others = await db.query.contacts.findMany({ where: eq(schema.contacts.companyId, company.id) });
      await db.insert(schema.contacts).values({ id, companyId: company.id, name: name || companyName || "Контакт с сайта", phone: phone ? `+${phone}` : null, email: email || null, isPrimary: others.length === 0 });
      contact = (await db.query.contacts.findFirst({ where: eq(schema.contacts.id, id) }))!;
    }

    // 3. Сделка в первой стадии воронки продаж
    const number = await nextNumber("deal");
    const dealId = newId("deal");
    const title = message ? `Заявка с сайта: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}` : `Заявка с сайта — ${company.name}`;
    await db.insert(schema.deals).values({ id: dealId, number, title, companyId: company.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id, amount: 0, managerId, status: "open", source, utm: Object.keys(utm).length ? utm : company.utm ?? null, ymClientId, nextStep: "Связаться с клиентом в течение 15 минут" });
    await logActivity({ type: "system", title: `Заявка №${number} с сайта (${source})`, body: [message, phoneRaw && `Телефон: ${phoneRaw}`, email && `Email: ${email}`, ymClientId && `ClientID Метрики: ${ymClientId}`, Object.keys(utm).length && `UTM: ${Object.entries(utm).map(([k, v]) => `${k}=${v}`).join(", ")}`].filter(Boolean).join("\n") || null, dealId, companyId: company.id, contactId: contact.id, userId: managerId, meta: { utm, ymClientId, isNewCompany } });
    const payload = { dealId, companyId: company.id, contactId: contact.id, userId: managerId, amount: 0, source, toStage: stage.name, pipelineKind: "sales", text: message || null };
    await emit("lead.created", payload);
    await emit("deal.created", payload);
    return NextResponse.json({ ok: true, dealId, number, companyId: company.id, contactId: contact.id, managerId }, { status: 201, headers: CORS });
  } catch (e) {
    console.error("[public/lead]", e);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить заявку" }, { status: 500, headers: CORS });
  }
}
