import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { appUrl, getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page";
import { LinkTabs } from "@/components/tasks/link-tabs";
import { CompanyForm } from "@/components/settings/company-form";
import { UsersTable } from "@/components/settings/users-table";
import { teamLabel } from "@/components/settings/teams";
import { RolesEditor } from "@/components/settings/roles-editor";
import { DistributionForm } from "@/components/settings/distribution-form";
import { BookingForm } from "@/components/settings/booking-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { SOURCES } from "@/components/deals/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Настройки" };

const TABS = [
  { key: "company", label: "Компания" },
  { key: "users", label: "Сотрудники" },
  { key: "roles", label: "Роли и права" },
  { key: "distribution", label: "Распределение заявок" },
  { key: "booking", label: "Онлайн-запись" },
  { key: "profile", label: "Профиль" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const isSettingsAdmin = can(user.actor, "settings", "view");
  const canEdit = can(user.actor, "settings", "edit");
  const tabs = isSettingsAdmin ? TABS : TABS.filter((t) => t.key === "profile");
  const requested = sp.tab as Tab | undefined;
  const tab: Tab = tabs.some((t) => t.key === requested) ? (requested as Tab) : tabs[0].key;

  const me = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });

  return (
    <>
      <PageHeader title="Настройки" description={isSettingsAdmin ? "Реквизиты для документов, сотрудники, роли и права доступа, распределение заявок, онлайн-запись." : "Ваш профиль и пароль. Остальные настройки доступны администратору."} />
      <LinkTabs className="mb-4" active={tab} items={tabs.map((t) => ({ key: t.key, label: t.label, href: t.key === tabs[0].key ? "/settings" : `/settings?tab=${t.key}` }))} />

      {tab === "company" && <CompanyForm initial={await getSetting("company")} canEdit={canEdit} />}

      {tab === "users" && (
        <UsersTable
          users={(await db.select({ u: schema.users, roleName: schema.roles.name }).from(schema.users).innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id)).orderBy(asc(schema.users.isActive), asc(schema.users.name))).map(({ u, roleName }) => ({
            id: u.id, name: u.name, email: u.email, phone: u.phone, roleId: u.roleId, roleName, teamId: u.teamId, isActive: u.isActive, acceptsLeads: u.acceptsLeads, leadWeight: u.leadWeight, skills: u.skills ?? [], telegramLinked: !!u.telegramChatId, workStart: u.workStart, workEnd: u.workEnd, workDays: u.workDays ?? [], color: u.color,
          })).sort((a, b) => Number(b.isActive) - Number(a.isActive))}
          roles={await db.select({ id: schema.roles.id, name: schema.roles.name, slug: schema.roles.slug }).from(schema.roles).orderBy(asc(schema.roles.createdAt))}
          currentUserId={user.id}
          canEdit={canEdit}
        />
      )}

      {tab === "roles" && (
        <RolesEditor
          roles={await Promise.all(
            (await db.select().from(schema.roles).orderBy(asc(schema.roles.createdAt))).map(async (r) => ({
              id: r.id, name: r.name, slug: r.slug, description: r.description, permissions: r.permissions, isSystem: r.isSystem,
              usersCount: (await db.select({ n: count() }).from(schema.users).where(eq(schema.users.roleId, r.id)))[0].n,
            })),
          )}
          canEdit={canEdit}
          canDelete={can(user.actor, "settings", "delete")}
        />
      )}

      {tab === "distribution" && (
        <DistributionForm
          initial={await getSetting("distribution")}
          managers={await Promise.all(
            (await db.select().from(schema.users).where(and(eq(schema.users.isActive, true), eq(schema.users.acceptsLeads, true))).orderBy(asc(schema.users.name))).map(async (u) => ({
              id: u.id, name: u.name, color: u.color, weight: u.leadWeight, skills: u.skills ?? [],
              open: (await db.select({ n: count() }).from(schema.deals).where(and(eq(schema.deals.managerId, u.id), eq(schema.deals.status, "open"))))[0].n,
            })),
          )}
          sources={SOURCES}
          canEdit={canEdit}
        />
      )}

      {tab === "booking" && (
        <BookingForm initial={await getSetting("booking")} pipelines={await db.select({ id: schema.pipelines.id, name: schema.pipelines.name }).from(schema.pipelines).orderBy(asc(schema.pipelines.order))} bookingUrl={appUrl("/book")} canEdit={canEdit} />
      )}

      {tab === "profile" && me && (
        <ProfileForm user={{ name: me.name, email: me.email, phone: me.phone, color: me.color, roleName: user.roleName, teamLabel: teamLabel(me.teamId), telegramLinked: !!me.telegramChatId }} />
      )}
    </>
  );
}
