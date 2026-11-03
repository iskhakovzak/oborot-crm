import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { CalendarDays, Globe } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, scopeOf } from "@/lib/permissions";
import { appUrl } from "@/lib/settings";
import { weekStart as mondayOf } from "@/lib/analytics";
import { PageHeader, EmptyState, Stat } from "@/components/ui/page";
import { WeekView, type CalBooking, type CalUser } from "@/components/calendar/week-view";
import { BookingTypes, type BookingTypeRow } from "@/components/calendar/booking-types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; user?: string; tab?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!can(user.actor, "bookings", "view")) return <EmptyState icon={<CalendarDays />} title="Нет доступа к календарю" />;
  const tab = sp.tab === "booking" ? "booking" : "calendar";

  // область видимости: свои / команда / все
  const scope = scopeOf(user.actor, "bookings", "view");
  const allUsers = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, teamId: schema.users.teamId }).from(schema.users).where(eq(schema.users.isActive, true));
  const visibleUsers: CalUser[] = allUsers.filter((u) => scope === "all" || u.id === user.id || (scope === "team" && !!user.teamId && u.teamId === user.teamId)).map(({ id, name, color }) => ({ id, name, color }));
  const visibleIds = visibleUsers.map((u) => u.id);

  const weekParam = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? new Date(`${sp.week}T00:00:00`) : new Date();
  const start = mondayOf(Number.isNaN(weekParam.getTime()) ? new Date() : weekParam);
  const end = new Date(start.getTime() + 7 * 86400_000);
  const filterUser = sp.user && visibleIds.includes(sp.user) ? sp.user : "";
  const ids = filterUser ? [filterUser] : visibleIds;

  const rows = ids.length
    ? await db
        .select({ b: schema.bookings, userName: schema.users.name, userColor: schema.users.color, companyName: schema.companies.name, dealTitle: schema.deals.title, typeName: schema.bookingTypes.name })
        .from(schema.bookings)
        .innerJoin(schema.users, eq(schema.bookings.userId, schema.users.id))
        .leftJoin(schema.companies, eq(schema.bookings.companyId, schema.companies.id))
        .leftJoin(schema.deals, eq(schema.bookings.dealId, schema.deals.id))
        .leftJoin(schema.bookingTypes, eq(schema.bookings.bookingTypeId, schema.bookingTypes.id))
        .where(and(inArray(schema.bookings.userId, ids), gte(schema.bookings.endsAt, start.toISOString()), lte(schema.bookings.startsAt, end.toISOString()), ne(schema.bookings.status, "cancelled")))
        .orderBy(schema.bookings.startsAt)
    : [];
  const bookings: CalBooking[] = rows.map(({ b, userName, userColor, companyName, dealTitle, typeName }) => ({
    id: b.id, title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, userId: b.userId, userName, userColor, clientName: b.clientName, clientPhone: b.clientPhone, clientEmail: b.clientEmail, comment: b.comment,
    companyId: b.companyId, companyName, dealId: b.dealId, dealTitle, source: b.source, status: b.status, typeName,
  }));
  const companies = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(ne(schema.companies.status, "archived")).orderBy(schema.companies.name);

  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ n: publicCount }] = await db.select({ n: count() }).from(schema.bookings).where(and(eq(schema.bookings.source, "public"), gte(schema.bookings.createdAt, since30), ne(schema.bookings.status, "cancelled")));
  const [{ n: weekCount }] = visibleIds.length
    ? await db.select({ n: count() }).from(schema.bookings).where(and(inArray(schema.bookings.userId, visibleIds), gte(schema.bookings.startsAt, start.toISOString()), lte(schema.bookings.startsAt, end.toISOString()), ne(schema.bookings.status, "cancelled")))
    : [{ n: 0 }];
  const typesRaw = await db
    .select({ t: schema.bookingTypes, userName: schema.users.name, userColor: schema.users.color })
    .from(schema.bookingTypes)
    .innerJoin(schema.users, eq(schema.bookingTypes.userId, schema.users.id))
    .orderBy(desc(schema.bookingTypes.isActive), schema.bookingTypes.name);
  const recentPublic = await db.select({ typeId: schema.bookings.bookingTypeId, n: count() }).from(schema.bookings).where(and(eq(schema.bookings.source, "public"), gte(schema.bookings.createdAt, since30))).groupBy(schema.bookings.bookingTypeId);
  const perType = new Map(recentPublic.map((r) => [r.typeId, r.n]));
  const types: BookingTypeRow[] = typesRaw.map(({ t, userName, userColor }) => ({ ...t, description: t.description ?? "", userName, userColor, bookings30: perType.get(t.id) ?? 0 }));
  const activeTypes = types.filter((t) => t.isActive).length;

  const canCreate = can(user.actor, "bookings", "create");
  const canEdit = can(user.actor, "bookings", "edit");
  const lockUser = scopeOf(user.actor, "bookings", "edit") === "own";
  const tabs = [
    { key: "calendar", label: "Календарь", icon: CalendarDays },
    { key: "booking", label: "Онлайн-запись", icon: Globe },
  ];

  return (
    <>
      <PageHeader title="Календарь" description="Встречи, замеры и консультации сотрудников. Клиенты записываются сами через публичную страницу — слоты считаются с учётом занятости и буфера." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Событий на неделе" value={weekCount} sub={`${iso(start).slice(8)}.${iso(start).slice(5, 7)} — ${iso(new Date(end.getTime() - 1)).slice(8)}.${iso(new Date(end.getTime() - 1)).slice(5, 7)}`} />
        <Stat label="Через онлайн-запись" value={publicCount} sub="за 30 дней" tone="info" />
        <Stat label="Типов записи" value={`${activeTypes} / ${types.length}`} sub="включено" />
        <Stat label="Сотрудников" value={visibleUsers.length} sub="в календаре" />
      </div>
      <nav className="mb-4 inline-flex h-9 items-center gap-1 rounded-[9px] bg-black/5 p-1">
        {tabs.map((t) => (
          <Link key={t.key} href={`/calendar?tab=${t.key}${sp.week ? `&week=${sp.week}` : ""}`} className={cn("inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-colors", tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}>
            <t.icon className="size-3.5" /> {t.label}
          </Link>
        ))}
      </nav>
      {tab === "calendar" ? (
        <WeekView weekStart={iso(start)} bookings={bookings} users={visibleUsers} companies={companies} filterUser={filterUser} canCreate={canCreate} canEdit={canEdit} defaultUserId={user.id} />
      ) : (
        <BookingTypes types={types} users={visibleUsers} appUrl={appUrl()} canEdit={canEdit} canCreate={canCreate} currentUserId={user.id} lockUser={lockUser} />
      )}
    </>
  );
}
