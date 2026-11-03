import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarX2 } from "lucide-react";
import { db, schema } from "@/db";
import { freeSlots } from "@/lib/calendar";
import { getSetting } from "@/lib/settings";
import { BookFlow } from "@/components/calendar/book-flow";

export const dynamic = "force-dynamic";

/** 30. Публичная страница записи: день → время → контакты → подтверждение */
export default async function BookTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getSetting("company");
  const row = await db
    .select({ t: schema.bookingTypes, userName: schema.users.name, userColor: schema.users.color })
    .from(schema.bookingTypes)
    .innerJoin(schema.users, eq(schema.bookingTypes.userId, schema.users.id))
    .where(eq(schema.bookingTypes.slug, slug))
    .then((r) => r[0]);
  if (!row || !row.t.isActive) {
    return (
      <div className="rounded-[14px] border border-dashed border-line-strong bg-surface p-8 text-center rise">
        <CalendarX2 className="mx-auto size-8 text-muted" />
        <p className="mt-3 text-[15px] font-medium">Запись на эту услугу сейчас недоступна</p>
        <p className="mt-1 text-[13px] text-muted">Посмотрите другие услуги или позвоните нам: {company.phone}</p>
        <Link href="/book" className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-4 text-[14px] font-medium hover:bg-surface-2"><ArrowLeft className="size-4" /> Все услуги</Link>
      </div>
    );
  }
  const slots = await freeSlots(row.t.id, new Date(), row.t.horizonDays);
  return (
    <BookFlow
      slug={slug}
      type={{ name: row.t.name, description: row.t.description, durationMin: row.t.durationMin, location: row.t.location, userName: row.userName, userColor: row.userColor }}
      slots={slots}
      company={{ name: company.shortName, phone: company.phone }}
    />
  );
}
