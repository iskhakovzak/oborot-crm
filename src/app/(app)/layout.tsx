import { requireUser, logout } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { ENTITIES, can, type EntityKey } from "@/lib/permissions";
import { db, schema } from "@/db";
import { and, eq, count } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const allowed = Object.fromEntries(ENTITIES.map((e) => [e.key, can(user.actor, e.key as EntityKey, "view")]));
  const [{ n }] = await db.select({ n: count() }).from(schema.tasks).where(and(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.status, "open")));
  async function doLogout() {
    "use server";
    await logout();
    redirect("/login");
  }
  return (
    <div className="min-h-screen">
      <Sidebar allowed={allowed} />
      <div className="lg:pl-[232px]">
        <Topbar user={{ name: user.name, color: user.color, roleName: user.roleName, email: user.email }} onLogout={doLogout} openTasks={n} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
