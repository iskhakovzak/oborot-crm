import { requireUser, logout } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Conductor } from "@/components/conductor/conductor";
import { ENTITIES, can, type EntityKey } from "@/lib/permissions";
import { db, schema } from "@/db";
import { and, eq, count } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowed = Object.fromEntries(ENTITIES.map((e) => [e.key, can(user.actor, e.key as EntityKey, "view")]));
  const [{ n }] = await db.select({ n: count() }).from(schema.tasks).where(and(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.status, "open")));
  const ints = await db.select({ enabled: schema.integrations.isEnabled, status: schema.integrations.status }).from(schema.integrations);
  const live = { up: ints.filter((i) => i.enabled).length, total: ints.length };
  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }
  return (
    <div className="min-h-screen">
      <Sidebar allowed={allowed} user={{ name: user.name, color: user.color, roleName: user.roleName }} live={live} />
      <div className="lg:pl-[232px]">
        <Topbar user={{ name: user.name, color: user.color, roleName: user.roleName, email: user.email }} onLogout={doLogout} openTasks={n} allowed={allowed} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 lg:px-7"><div className="slab">{children}</div></main>
        <Conductor />
      </div>
    </div>
  );
}
