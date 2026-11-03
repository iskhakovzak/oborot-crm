"use server";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, canRecord, scopeOf } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { audit, logActivity } from "@/lib/activity";
import { emit } from "@/lib/events";

export type BookingInput = { title: string; userId: string; date: string; time: string; durationMin: number; companyId?: string | null; comment?: string | null };

/** Событие в календаре вручную (менеджер записывает клиента сам) */
export async function createBooking(input: BookingInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user.actor, "bookings", "create")) return { ok: false, error: "Нет прав на создание событий" };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Укажите название события" };
  const userId = scopeOf(user.actor, "bookings", "edit") === "own" ? user.id : input.userId || user.id;
  const starts = new Date(`${input.date}T${input.time || "10:00"}:00`);
  if (Number.isNaN(starts.getTime())) return { ok: false, error: "Неверная дата или время" };
  const duration = Math.min(8 * 60, Math.max(15, Number(input.durationMin) || 30));
  const ends = new Date(starts.getTime() + duration * 60_000);
  const clash = await db.query.bookings.findFirst({ where: and(eq(schema.bookings.userId, userId), eq(schema.bookings.status, "confirmed"), lte(schema.bookings.startsAt, ends.toISOString()), gte(schema.bookings.endsAt, starts.toISOString())) });
  if (clash && new Date(clash.startsAt) < ends && new Date(clash.endsAt) > starts) return { ok: false, error: `Время занято: «${clash.title}»` };
  const company = input.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, input.companyId) }) : null;
  const contact = company ? (await db.query.contacts.findFirst({ where: and(eq(schema.contacts.companyId, company.id), eq(schema.contacts.isPrimary, true)) })) ?? (await db.query.contacts.findFirst({ where: eq(schema.contacts.companyId, company.id) })) : null;
  const deal = company ? await db.query.deals.findFirst({ where: and(eq(schema.deals.companyId, company.id), eq(schema.deals.status, "open")) }) : null;
  const id = newId("bkg");
  await db.insert(schema.bookings).values({
    id, userId, title, startsAt: starts.toISOString(), endsAt: ends.toISOString(), comment: input.comment?.trim() || null,
    clientName: contact?.name ?? company?.name ?? null, clientPhone: contact?.phone ?? company?.phone ?? null, clientEmail: contact?.email ?? company?.email ?? null,
    companyId: company?.id ?? null, dealId: deal?.id ?? null, source: "manual", status: "confirmed",
  });
  if (company) await logActivity({ type: "system", title: `Запись в календаре: ${title}`, body: `${starts.toLocaleString("ru-RU")} · ${duration} мин`, companyId: company.id, dealId: deal?.id ?? null, contactId: contact?.id ?? null, userId: user.id, meta: { bookingId: id } });
  await audit(user.id, "bookings", id, "create", { title });
  await emit("booking.created", { bookingId: id, companyId: company?.id ?? null, contactId: contact?.id ?? null, dealId: deal?.id ?? null, userId });
  revalidatePath("/calendar");
  return { ok: true, id };
}

export async function cancelBooking(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) });
  if (!b) return { ok: false, error: "Событие не найдено" };
  if (!canRecord(user.actor, "bookings", "edit", { ownerId: b.userId })) return { ok: false, error: "Нет прав на отмену этого события" };
  await db.update(schema.bookings).set({ status: "cancelled" }).where(eq(schema.bookings.id, id));
  if (b.companyId) await logActivity({ type: "system", title: `Запись отменена: ${b.title}`, companyId: b.companyId, dealId: b.dealId, userId: user.id, meta: { bookingId: id } });
  await audit(user.id, "bookings", id, "update", { status: "cancelled" });
  revalidatePath("/calendar");
  return { ok: true };
}

export async function completeBooking(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const b = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, id) });
  if (!b) return { ok: false, error: "Событие не найдено" };
  if (!canRecord(user.actor, "bookings", "edit", { ownerId: b.userId })) return { ok: false, error: "Нет прав" };
  await db.update(schema.bookings).set({ status: "done" }).where(eq(schema.bookings.id, id));
  revalidatePath("/calendar");
  return { ok: true };
}

export type BookingTypeInput = { id?: string; name: string; slug: string; description?: string; userId: string; durationMin: number; bufferMin: number; workDays: number[]; workStart: string; workEnd: string; horizonDays: number; location: string; isActive: boolean };

/** 30. Тип онлайн-записи: публичная страница /book/<slug> */
export async function saveBookingType(input: BookingTypeInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user.actor, "bookings", input.id ? "edit" : "create")) return { ok: false, error: "Нет прав на настройку онлайн-записи" };
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!name) return { ok: false, error: "Укажите название" };
  if (!slug) return { ok: false, error: "Укажите ссылку латиницей, например consult" };
  if (!/^\d{2}:\d{2}$/.test(input.workStart) || !/^\d{2}:\d{2}$/.test(input.workEnd) || input.workStart >= input.workEnd) return { ok: false, error: "Проверьте рабочие часы" };
  if (!input.workDays.length) return { ok: false, error: "Выберите хотя бы один рабочий день" };
  const ownerId = scopeOf(user.actor, "bookings", "edit") === "own" ? user.id : input.userId || user.id;
  const taken = await db.query.bookingTypes.findFirst({ where: input.id ? and(eq(schema.bookingTypes.slug, slug), ne(schema.bookingTypes.id, input.id)) : eq(schema.bookingTypes.slug, slug) });
  if (taken) return { ok: false, error: "Такая ссылка уже занята" };
  const values = {
    name, slug, description: input.description?.trim() || null, userId: ownerId,
    durationMin: Math.min(480, Math.max(10, Number(input.durationMin) || 30)), bufferMin: Math.min(120, Math.max(0, Number(input.bufferMin) || 0)),
    workDays: input.workDays.map(Number).filter((d) => d >= 0 && d <= 6), workStart: input.workStart, workEnd: input.workEnd,
    horizonDays: Math.min(90, Math.max(1, Number(input.horizonDays) || 14)), location: input.location.trim() || "Онлайн, ссылка придёт в подтверждении", isActive: !!input.isActive,
  };
  let id = input.id;
  if (id) {
    const existing = await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.id, id) });
    if (!existing) return { ok: false, error: "Тип записи не найден" };
    if (!canRecord(user.actor, "bookings", "edit", { ownerId: existing.userId })) return { ok: false, error: "Можно менять только свои типы записи" };
    await db.update(schema.bookingTypes).set(values).where(eq(schema.bookingTypes.id, id));
    await audit(user.id, "booking_types", id, "update", { name });
  } else {
    id = newId("bkt");
    await db.insert(schema.bookingTypes).values({ id, ...values });
    await audit(user.id, "booking_types", id, "create", { name });
  }
  revalidatePath("/calendar");
  revalidatePath("/book");
  revalidatePath(`/book/${slug}`);
  return { ok: true, id };
}

export async function toggleBookingType(id: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const bt = await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.id, id) });
  if (!bt) return { ok: false, error: "Тип записи не найден" };
  if (!can(user.actor, "bookings", "edit") || !canRecord(user.actor, "bookings", "edit", { ownerId: bt.userId })) return { ok: false, error: "Нет прав" };
  await db.update(schema.bookingTypes).set({ isActive }).where(eq(schema.bookingTypes.id, id));
  revalidatePath("/calendar");
  revalidatePath("/book");
  return { ok: true };
}
