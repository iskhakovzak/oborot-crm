import Link from "next/link";
import { eq } from "drizzle-orm";
import { Clock, MapPin, ArrowRight, CalendarX2 } from "lucide-react";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { Avatar } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

/** 30. Публичный список услуг для онлайн-записи */
export default async function BookIndexPage() {
  const company = await getSetting("company");
  const types = await db
    .select({ t: schema.bookingTypes, userName: schema.users.name, userColor: schema.users.color })
    .from(schema.bookingTypes)
    .innerJoin(schema.users, eq(schema.bookingTypes.userId, schema.users.id))
    .where(eq(schema.bookingTypes.isActive, true))
    .orderBy(schema.bookingTypes.name);
  return (
    <div className="rise">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">Запишитесь на удобное время</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Выберите услугу — покажем свободные окна специалистов {company.shortName}. Подтверждение придёт сразу.</p>
      <div className="mt-6 space-y-3">
        {types.map(({ t, userName, userColor }) => (
          <Link key={t.id} href={`/book/${t.slug}`} className="block rounded-[14px] border border-line bg-surface p-4 transition-colors hover:border-line-strong active:bg-surface-2 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold leading-snug">{t.name}</h2>
                {t.description && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{t.description}</p>}
              </div>
              <ArrowRight className="mt-1 size-5 shrink-0 text-muted" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-muted" />{t.durationMin} мин</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-muted" />{t.location}</span>
              <span className="inline-flex items-center gap-1.5"><Avatar name={userName} color={userColor} size={18} />{userName}</span>
            </div>
            <div className="mt-4 inline-flex h-10 items-center justify-center rounded-[8px] bg-ink px-4 text-[14px] font-medium text-canvas">Выбрать время</div>
          </Link>
        ))}
        {!types.length && (
          <div className="rounded-[14px] border border-dashed border-line-strong bg-surface p-8 text-center">
            <CalendarX2 className="mx-auto size-8 text-muted" />
            <p className="mt-3 text-[15px] font-medium">Онлайн-запись пока закрыта</p>
            <p className="mt-1 text-[13px] text-muted">Позвоните нам: {company.phone}</p>
          </div>
        )}
      </div>
    </div>
  );
}
