import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";

/** 30. Свободные слоты для онлайн-записи: рабочие часы минус занятые брони и буфер */
export async function freeSlots(bookingTypeId: string, fromDate: Date, days: number) {
  const bt = await db.query.bookingTypes.findFirst({ where: eq(schema.bookingTypes.id, bookingTypeId) });
  if (!bt || !bt.isActive) return [];
  const start = new Date(fromDate); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86400_000);
  const busy = await db.select({ s: schema.bookings.startsAt, e: schema.bookings.endsAt }).from(schema.bookings).where(and(eq(schema.bookings.userId, bt.userId), gte(schema.bookings.endsAt, start.toISOString()), lte(schema.bookings.startsAt, end.toISOString()), eq(schema.bookings.status, "confirmed")));
  const slots: { date: string; times: string[] }[] = [];
  const step = bt.durationMin + bt.bufferMin;
  const [wsH, wsM] = bt.workStart.split(":").map(Number);
  const [weH, weM] = bt.workEnd.split(":").map(Number);
  const now = Date.now() + 60 * 60_000; // не раньше чем через час
  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 86400_000);
    if (!bt.workDays.includes(day.getDay())) continue;
    const times: string[] = [];
    for (let t = wsH * 60 + wsM; t + bt.durationMin <= weH * 60 + weM; t += step) {
      const s = new Date(day); s.setHours(Math.floor(t / 60), t % 60, 0, 0);
      const e = new Date(s.getTime() + bt.durationMin * 60_000);
      if (s.getTime() < now) continue;
      const overlap = busy.some((b) => new Date(b.s).getTime() < e.getTime() + bt.bufferMin * 60_000 && new Date(b.e).getTime() + bt.bufferMin * 60_000 > s.getTime());
      if (!overlap) times.push(s.toISOString());
    }
    if (times.length) slots.push({ date: day.toISOString().slice(0, 10), times });
  }
  return slots;
}
