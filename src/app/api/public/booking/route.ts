import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { freeSlots } from "@/lib/calendar";
import { getSetting } from "@/lib/settings";
import { nextNumber } from "@/lib/counters";
import { newId } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";

export const dynamic = "force-dynamic";

const bad = (error: string, extra: Record<string, unknown> = {}, status = 400) => NextResponse.json({ ok: false, error, ...extra }, { status });

function normalizePhone(p: string) {
  let d = p.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("9")) d = "7" + d;
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  return d;
}
const prettyPhone = (d: string) => (d.length === 11 ? `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}` : d);

/** 30. Самостоятельная запись клиента в свободный слот: бронь + клиент + контакт + сделка + события */
export async function POST(req: Request) {
  let body: { slug?: string; startsAt?: string; name?: string; phone?: string; email?: string; company?: string; comment?: string };
  try { body = await req.json(); } catch { return bad("Некорректный запрос"); }
  const slug = String(body.slug ?? "").trim();
  const name = String(body.name ?? "").trim().slice(0, 120);
  const phoneDigits = normalizePhone(String(body.phone ?? ""));
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
  const companyName = String(body.company ?? "").trim().slice(0, 200);
  const comment = String(body.comment ?? "").trim().slice(0, 1000);
  const startsAt = new Date(String(body.startsAt ?? ""));
  if (!slug || Number.isNaN(startsAt.getTime())) return bad("Не выбрано время");
  if (name.length < 2) return bad("Укажите имя");
  if (phoneDigits.length < 10) return bad("Укажите телефон полностью");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Проверьте email");

  const bt = await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.slug, slug) });
  if (!bt || !bt.isActive) return bad("Запись на эту услугу недоступна", {}, 404);

  // повторная проверка: слот всё ещё свободен
  const daySlots = await freeSlots(bt.id, startsAt, 1);
  const free = daySlots.some((d) => d.times.some((t) => new Date(t).getTime() === startsAt.getTime()));
  if (!free) return bad("Это время только что заняли. Выберите другое.", { slots: await freeSlots(bt.id, new Date(), bt.horizonDays) }, 409);
  const endsAt = new Date(startsAt.getTime() + bt.durationMin * 60_000);
  const phone = prettyPhone(phoneDigits);

  // клиент: по телефону (контакт или компания), затем по названию, иначе создаём
  const contactsAll = await db.select().from(schema.contacts).where(isNotNull(schema.contacts.phone));
  const byPhone = contactsAll.find((c) => normalizePhone(c.phone ?? "") === phoneDigits);
  let company = byPhone?.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, byPhone.companyId) }) : null;
  if (!company) {
    const companiesAll = await db.select().from(schema.companies).where(isNotNull(schema.companies.phone));
    company = companiesAll.find((c) => normalizePhone(c.phone ?? "") === phoneDigits) ?? null;
  }
  if (!company && companyName) company = (await db.query.companies.findFirst({ where: eq(schema.companies.name, companyName) })) ?? null;
  let isNewCompany = false;
  if (!company) {
    const id = newId("cmp");
    await db.insert(schema.companies).values({ id, name: companyName || name, shortName: companyName || name, phone, email: email || null, status: "lead", source: "Онлайн-запись", managerId: bt.userId, tags: ["онлайн-запись"] });
    company = (await db.query.companies.findFirst({ where: eq(schema.companies.id, id) }))!;
    isNewCompany = true;
  }
  let contact = byPhone && byPhone.companyId === company.id ? byPhone : await db.query.contacts.findFirst({ where: and(eq(schema.contacts.companyId, company.id), eq(schema.contacts.name, name)) });
  if (!contact) {
    const hasPrimary = await db.query.contacts.findFirst({ where: and(eq(schema.contacts.companyId, company.id), eq(schema.contacts.isPrimary, true)) });
    const id = newId("cnt");
    await db.insert(schema.contacts).values({ id, companyId: company.id, name, phone, email: email || null, isPrimary: !hasPrimary });
    contact = (await db.query.contacts.findFirst({ where: eq(schema.contacts.id, id) }))!;
  }

  // сделка в первой стадии воронки продаж (если включено в настройках записи)
  const bookingSettings = await getSetting("booking");
  let dealId: string | null = null;
  if (bookingSettings.createLead) {
    const pipeline = (bookingSettings.defaultPipelineId ? await db.query.pipelines.findFirst({ where: eq(schema.pipelines.id, bookingSettings.defaultPipelineId) }) : null) ?? (await db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, "sales"), orderBy: schema.pipelines.order }));
    const stage = pipeline ? await db.query.stages.findFirst({ where: and(eq(schema.stages.pipelineId, pipeline.id), eq(schema.stages.kind, "open")), orderBy: schema.stages.order }) : null;
    if (pipeline && stage) {
      const openDeal = await db.query.deals.findFirst({ where: and(eq(schema.deals.companyId, company.id), eq(schema.deals.status, "open"), eq(schema.deals.pipelineId, pipeline.id)) });
      if (openDeal) dealId = openDeal.id;
      else {
        dealId = newId("deal");
        const number = await nextNumber("deal");
        await db.insert(schema.deals).values({ id: dealId, number, title: `${bt.name}: ${companyName || name}`, companyId: company.id, contactId: contact.id, pipelineId: pipeline.id, stageId: stage.id, amount: 0, managerId: bt.userId, status: "open", source: "Онлайн-запись", nextStep: `Провести: ${bt.name}` });
        await logActivity({ type: "system", title: "Заявка из онлайн-записи", body: comment || null, dealId, companyId: company.id, contactId: contact.id, userId: bt.userId });
        await emit("lead.created", { dealId, companyId: company.id, contactId: contact.id, userId: bt.userId, source: "Онлайн-запись" });
      }
    }
  }

  const bookingId = newId("bkg");
  await db.insert(schema.bookings).values({
    id: bookingId, bookingTypeId: bt.id, userId: bt.userId, title: `${bt.name}: ${name}`, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    clientName: name, clientPhone: phone, clientEmail: email || null, comment: comment || null, companyId: company.id, dealId, source: "public", status: "confirmed",
  });
  await logActivity({ type: "system", title: `Онлайн-запись: ${bt.name}`, body: `${startsAt.toLocaleString("ru-RU")} · ${bt.durationMin} мин${isNewCompany ? " · новый клиент" : ""}`, dealId, companyId: company.id, contactId: contact.id, userId: bt.userId, meta: { bookingId } });
  await emit("booking.created", { bookingId, companyId: company.id, contactId: contact.id, dealId, userId: bt.userId });

  return NextResponse.json({ ok: true, booking: { bookingId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } });
}
