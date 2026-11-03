import { and, desc, eq, inArray, isNull, lt, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { can, canRecord, scopeOf } from "@/lib/permissions";
import { fmtDateTime, fmtTime, relTime } from "@/lib/format";
import type { TaskGroup, TaskRowData } from "@/components/tasks/types";

export type TaskTab = "my" | "all" | "overdue" | "done";

/** id сотрудников команды текущего пользователя (включая его самого) */
export async function teamUserIds(user: SessionUser) {
  if (!user.teamId) return [user.id];
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.teamId, user.teamId));
  return Array.from(new Set([user.id, ...rows.map((r) => r.id)]));
}

/** Фильтр видимости задач по области роли: own → мои (исполнитель или автор), team → команда, all → все */
export async function taskScopeWhere(user: SessionUser): Promise<SQL | undefined> {
  const scope = scopeOf(user.actor, "tasks", "view");
  if (scope === "all") return undefined;
  if (scope === "team") {
    const ids = await teamUserIds(user);
    return or(inArray(schema.tasks.assigneeId, ids), eq(schema.tasks.creatorId, user.id));
  }
  return or(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.creatorId, user.id));
}

const assignee = alias(schema.users, "assignee");

export async function loadTasks(user: SessionUser, opts: { tab: TaskTab; limit?: number }): Promise<TaskRowData[]> {
  if (!can(user.actor, "tasks", "view")) return [];
  const now = new Date().toISOString();
  const scopeWhere = await taskScopeWhere(user);
  const conds: (SQL | undefined)[] = [scopeWhere];
  if (opts.tab === "my") conds.push(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.status, "open"));
  if (opts.tab === "all") conds.push(eq(schema.tasks.status, "open"));
  if (opts.tab === "overdue") conds.push(eq(schema.tasks.status, "open"), lt(schema.tasks.dueAt, now));
  if (opts.tab === "done") conds.push(eq(schema.tasks.status, "done"));
  const rows = await db
    .select({ task: schema.tasks, assigneeName: assignee.name, assigneeColor: assignee.color, assigneeTeam: assignee.teamId, dealTitle: schema.deals.title, companyName: schema.companies.name })
    .from(schema.tasks)
    .leftJoin(assignee, eq(schema.tasks.assigneeId, assignee.id))
    .leftJoin(schema.deals, eq(schema.tasks.dealId, schema.deals.id))
    .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
    .where(and(...conds.filter((c): c is SQL => !!c)))
    .orderBy(opts.tab === "done" ? desc(schema.tasks.completedAt) : schema.tasks.dueAt)
    .limit(opts.limit ?? 500);
  return rows.map((r) => toRow(user, r));
}

export function toRow(user: SessionUser, r: { task: typeof schema.tasks.$inferSelect; assigneeName: string | null; assigneeColor: string | null; assigneeTeam: string | null; dealTitle: string | null; companyName: string | null }): TaskRowData {
  const t = r.task;
  const own = t.assigneeId === user.id || t.creatorId === user.id;
  const rec = { ownerId: t.assigneeId, ownerTeamId: r.assigneeTeam };
  const overdue = !!t.dueAt && t.status === "open" && new Date(t.dueAt).getTime() < Date.now();
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    source: t.source,
    dueAt: t.dueAt,
    dueLabel: dueLabel(t.dueAt),
    dueExact: t.dueAt ? fmtDateTime(t.dueAt) : "Без срока",
    overdue,
    completedAt: t.completedAt,
    completedLabel: t.completedAt ? `готово ${relTime(t.completedAt)}` : "",
    assigneeId: t.assigneeId,
    assigneeName: r.assigneeName,
    assigneeColor: r.assigneeColor,
    dealId: t.dealId,
    dealTitle: r.dealTitle,
    companyId: t.companyId,
    companyName: r.companyName,
    canEdit: can(user.actor, "tasks", "edit") && (own || canRecord(user.actor, "tasks", "edit", rec)),
    canDelete: can(user.actor, "tasks", "delete") && (own || canRecord(user.actor, "tasks", "delete", rec)),
  };
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dueLabel(iso: string | null) {
  if (!iso) return "без срока";
  const d = new Date(iso);
  const today = startOfDay();
  const dayDiff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400_000);
  if (dayDiff === 0) return d.getTime() < Date.now() ? `сегодня, ${fmtTime(iso)}` : `сегодня в ${fmtTime(iso)}`;
  if (dayDiff === 1) return `завтра в ${fmtTime(iso)}`;
  if (dayDiff === -1) return `вчера, ${fmtTime(iso)}`;
  if (dayDiff < 0) return relTime(iso);
  if (dayDiff < 7) return new Intl.DateTimeFormat("ru-RU", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  return fmtDateTime(iso);
}

/** Группировка: Просрочено / Сегодня / Завтра / На неделе / Позже / Без срока */
export function groupTasks(tasks: TaskRowData[], opts?: { withOverdue?: boolean }): TaskGroup[] {
  const today = startOfDay();
  const buckets: Record<string, TaskRowData[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [], none: [] };
  for (const t of tasks) {
    if (!t.dueAt) { buckets.none.push(t); continue; }
    const d = new Date(t.dueAt);
    const dayDiff = Math.round((startOfDay(d).getTime() - today.getTime()) / 86400_000);
    if (opts?.withOverdue !== false && t.overdue && dayDiff < 0) buckets.overdue.push(t);
    else if (dayDiff <= 0) buckets.today.push(t);
    else if (dayDiff === 1) buckets.tomorrow.push(t);
    else if (dayDiff < 7) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const titles: Record<string, string> = { overdue: "Просрочено", today: "Сегодня", tomorrow: "Завтра", week: "На неделе", later: "Позже", none: "Без срока" };
  return Object.entries(buckets).filter(([, v]) => v.length).map(([key, v]) => ({ key, title: titles[key], tasks: v }));
}

/** Открытые задачи текущего пользователя на сегодня + просроченные (для рабочего стола) */
export async function loadTodayTasks(user: SessionUser) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const rows = await db
    .select({ task: schema.tasks, assigneeName: assignee.name, assigneeColor: assignee.color, assigneeTeam: assignee.teamId, dealTitle: schema.deals.title, companyName: schema.companies.name })
    .from(schema.tasks)
    .leftJoin(assignee, eq(schema.tasks.assigneeId, assignee.id))
    .leftJoin(schema.deals, eq(schema.tasks.dealId, schema.deals.id))
    .leftJoin(schema.companies, eq(schema.tasks.companyId, schema.companies.id))
    .where(and(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.status, "open"), or(lt(schema.tasks.dueAt, end.toISOString()), isNull(schema.tasks.dueAt))))
    .orderBy(schema.tasks.dueAt)
    .limit(30);
  return rows.map((r) => toRow(user, r));
}
