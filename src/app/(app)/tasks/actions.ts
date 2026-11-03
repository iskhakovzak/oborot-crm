"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, canRecord, readonlyFields } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function revalidate(dealId?: string | null, companyId?: string | null) {
  revalidatePath("/");
  revalidatePath("/tasks");
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

/** Задача + команда исполнителя: владельцем считается исполнитель, автор тоже имеет доступ */
async function loadTask(user: SessionUser, taskId: string, action: "view" | "edit" | "delete") {
  if (!can(user.actor, "tasks", action)) throw new Error("Нет прав на задачи");
  const row = await db
    .select({ task: schema.tasks, ownerTeamId: schema.users.teamId })
    .from(schema.tasks)
    .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
    .where(eq(schema.tasks.id, taskId))
    .then((r) => r[0]);
  if (!row) throw new Error("Задача не найдена");
  const own = row.task.assigneeId === user.id || row.task.creatorId === user.id;
  if (!own && !canRecord(user.actor, "tasks", action, { ownerId: row.task.assigneeId, ownerTeamId: row.ownerTeamId })) throw new Error("Эта задача принадлежит другому сотруднику");
  return row.task;
}

export type TaskInput = {
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueAt?: string | null;
  priority?: "low" | "normal" | "high";
  dealId?: string | null;
  companyId?: string | null;
};

function normalizeDue(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error("Некорректная дата");
  return d.toISOString();
}

export async function createTask(input: TaskInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "tasks", "create")) return fail("Нет прав на создание задач");
  try {
    const title = input.title.trim();
    if (!title) return fail("Укажите название задачи");
    const id = newId("task");
    let companyId = input.companyId ?? null;
    if (input.dealId && !companyId) companyId = (await db.query.deals.findFirst({ where: eq(schema.deals.id, input.dealId) }))?.companyId ?? null;
    await db.insert(schema.tasks).values({
      id,
      title,
      description: input.description?.trim() || null,
      assigneeId: input.assigneeId || user.id,
      creatorId: user.id,
      dealId: input.dealId || null,
      companyId,
      dueAt: normalizeDue(input.dueAt),
      priority: input.priority ?? "normal",
      source: "manual",
    });
    if (input.dealId || companyId) await logActivity({ type: "task", title: `Задача: ${title}`, dealId: input.dealId ?? null, companyId, userId: user.id, meta: { taskId: id } });
    revalidate(input.dealId, companyId);
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function updateTask(taskId: string, patch: Partial<TaskInput>): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const task = await loadTask(user, taskId, "edit");
    const ro = readonlyFields(user.actor, "tasks");
    const set: Partial<typeof schema.tasks.$inferInsert> = {};
    if (patch.title !== undefined) {
      if (ro.includes("title")) return fail("Название недоступно для изменения");
      const t = patch.title.trim();
      if (!t) return fail("Название не может быть пустым");
      set.title = t;
    }
    if (patch.description !== undefined) set.description = patch.description?.trim() || null;
    if (patch.assigneeId !== undefined) {
      if (ro.includes("assigneeId")) return fail("Переназначение недоступно для вашей роли");
      set.assigneeId = patch.assigneeId || null;
    }
    if (patch.dueAt !== undefined) {
      if (ro.includes("dueAt")) return fail("Срок недоступен для изменения");
      set.dueAt = normalizeDue(patch.dueAt);
    }
    if (patch.priority !== undefined) {
      if (ro.includes("priority")) return fail("Приоритет недоступен для изменения");
      set.priority = patch.priority;
    }
    if (patch.dealId !== undefined) set.dealId = patch.dealId || null;
    if (patch.companyId !== undefined) set.companyId = patch.companyId || null;
    if (!Object.keys(set).length) return { ok: true };
    await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, taskId));
    revalidate(task.dealId, task.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

/** Чекбокс в списке: задача выполнена */
export async function completeTask(taskId: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const task = await loadTask(user, taskId, "edit");
    if (task.status === "done") return { ok: true };
    await db.update(schema.tasks).set({ status: "done", completedAt: new Date().toISOString() }).where(eq(schema.tasks.id, taskId));
    if (task.dealId || task.companyId) await logActivity({ type: "task", title: `Выполнено: ${task.title}`, dealId: task.dealId, companyId: task.companyId, userId: user.id, meta: { taskId } });
    revalidate(task.dealId, task.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function reopenTask(taskId: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const task = await loadTask(user, taskId, "edit");
    await db.update(schema.tasks).set({ status: "open", completedAt: null }).where(eq(schema.tasks.id, taskId));
    revalidate(task.dealId, task.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

/** Перенос срока: на завтра, через N дней или на конкретную дату */
export async function rescheduleTask(taskId: string, to: "tomorrow" | "plus1" | "week" | string): Promise<{ ok: true; dueAt: string } | Fail> {
  const user = await requireUser();
  try {
    const task = await loadTask(user, taskId, "edit");
    if (readonlyFields(user.actor, "tasks").includes("dueAt")) return fail("Срок недоступен для изменения");
    let due: Date;
    if (to === "tomorrow") {
      due = new Date();
      due.setDate(due.getDate() + 1);
      due.setHours(10, 0, 0, 0);
    } else if (to === "plus1") {
      due = new Date(task.dueAt ? new Date(task.dueAt).getTime() + 86400_000 : Date.now() + 86400_000);
    } else if (to === "week") {
      due = new Date();
      due.setDate(due.getDate() + 7);
      due.setHours(10, 0, 0, 0);
    } else {
      due = new Date(to);
      if (Number.isNaN(due.getTime())) return fail("Некорректная дата");
    }
    const dueAt = due.toISOString();
    await db.update(schema.tasks).set({ dueAt }).where(eq(schema.tasks.id, taskId));
    revalidate(task.dealId, task.companyId);
    return { ok: true, dueAt };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteTask(taskId: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const task = await loadTask(user, taskId, "delete");
    await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    revalidate(task.dealId, task.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}
