import { Suspense } from "react";
import { and, asc, count, eq, lt } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, scopeOf } from "@/lib/permissions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TaskList } from "@/components/tasks/task-list";
import { LinkTabs } from "@/components/tasks/link-tabs";
import { groupTasks, loadTasks, taskScopeWhere, type TaskTab } from "./queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Задачи" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string; new?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!can(user.actor, "tasks", "view")) {
    return (
      <>
        <PageHeader title="Задачи" />
        <EmptyState title="Нет доступа к задачам" description="Попросите администратора открыть раздел «Задачи» для вашей роли." />
      </>
    );
  }
  const scope = scopeOf(user.actor, "tasks", "view");
  const showAll = scope !== "own";
  const tab: TaskTab = (["my", "all", "overdue", "done"] as const).includes(sp.tab as TaskTab) ? (sp.tab as TaskTab) : "my";
  const effectiveTab = tab === "all" && !showAll ? "my" : tab;

  const now = new Date().toISOString();
  const scopeWhere = await taskScopeWhere(user);
  const [tasks, users, deals, companies, [{ overdue }], [{ mine }]] = await Promise.all([
    loadTasks(user, { tab: effectiveTab }),
    db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color }).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(asc(schema.users.name)),
    db.select({ id: schema.deals.id, name: schema.deals.title, number: schema.deals.number }).from(schema.deals).where(eq(schema.deals.status, "open")).orderBy(asc(schema.deals.title)).limit(300),
    db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name)).limit(500),
    db.select({ overdue: count() }).from(schema.tasks).where(and(scopeWhere, eq(schema.tasks.status, "open"), lt(schema.tasks.dueAt, now))),
    db.select({ mine: count() }).from(schema.tasks).where(and(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.status, "open"))),
  ]);

  const groups = effectiveTab === "done" ? (tasks.length ? [{ key: "done", title: "Выполненные", tasks }] : []) : groupTasks(tasks);
  const canCreate = can(user.actor, "tasks", "create");
  const tabs = [
    { key: "my", label: "Мои", href: "/tasks", count: mine },
    ...(showAll ? [{ key: "all", label: scope === "team" ? "Команда" : "Все", href: "/tasks?tab=all" }] : []),
    { key: "overdue", label: "Просроченные", href: "/tasks?tab=overdue", count: overdue, tone: "accent" as const },
    { key: "done", label: "Выполненные", href: "/tasks?tab=done" },
  ];
  const empty: Record<TaskTab, [string, string]> = {
    my: ["Открытых задач нет", "Всё сделано. Новые задачи появятся здесь: от коллег, автоматизаций, Telegram-бота и ИИ."],
    all: ["Открытых задач нет", "Ни у кого из сотрудников нет открытых задач."],
    overdue: ["Просроченных задач нет", "Все задачи в срок."],
    done: ["Выполненных задач пока нет", "Отмечайте задачи чекбоксом — они будут собираться здесь."],
  };

  return (
    <>
      <PageHeader
        title="Задачи"
        description="Задачи сотрудников, автоматизаций, Telegram-бота и ИИ."
        actions={canCreate ? <Button asChild><Link href={`/tasks?${tab === "my" ? "" : `tab=${tab}&`}new=1`}><Plus /> Новая задача</Link></Button> : undefined}
      />
      <LinkTabs items={tabs} active={effectiveTab} className="mb-4" />
      <Suspense>
        <TaskList
          groups={groups}
          users={users}
          deals={deals.map((d) => ({ id: d.id, name: `№${d.number} · ${d.name}` }))}
          companies={companies}
          currentUserId={user.id}
          canCreate={canCreate}
          emptyTitle={empty[effectiveTab][0]}
          emptyText={empty[effectiveTab][1]}
        />
      </Suspense>
    </>
  );
}
