"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AutomationAction, AutomationCondition, AutomationEvent } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { audit } from "@/lib/activity";
import { runAutomations, ACTION_LABELS, EVENT_LABELS } from "@/lib/automations/engine";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const CHANNELS = ["preferred", "telegram", "whatsapp", "max", "vk", "email", "sms"] as const;
const OPS = ["eq", "neq", "gt", "lt", "contains", "in"] as const;

export type AutomationInput = {
  id?: string | null;
  name: string;
  description?: string | null;
  event: AutomationEvent;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive?: boolean;
};

function str(v: unknown, name: string, required = true): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw new Error(`Заполните поле «${name}»`);
  return s;
}

/** Проверка и нормализация действий — на сервере не доверяем форме */
function normalizeAction(raw: AutomationAction, idx: number): AutomationAction {
  const n = idx + 1;
  const r = raw as unknown as Record<string, unknown>;
  const type = r.type as AutomationAction["type"];
  if (!(type in ACTION_LABELS)) throw new Error(`Действие ${n}: неизвестный тип`);
  const channel = (): (typeof CHANNELS)[number] => {
    const c = String(r.channel ?? "preferred") as (typeof CHANNELS)[number];
    if (!CHANNELS.includes(c)) throw new Error(`Действие ${n}: неизвестный канал`);
    return c;
  };
  switch (type) {
    case "send_message": return { type, channel: channel(), template: str(r.template, `Действие ${n}: текст сообщения`) };
    case "send_sms": return { type, template: str(r.template, `Действие ${n}: текст SMS`) };
    case "send_email": return { type, subject: str(r.subject, `Действие ${n}: тема письма`), template: str(r.template, `Действие ${n}: текст письма`) };
    case "call_client": return { type, script: str(r.script, "", false) || undefined };
    case "create_task": {
      const dueInHours = Number(r.dueInHours);
      if (!Number.isFinite(dueInHours) || dueInHours <= 0) throw new Error(`Действие ${n}: срок задачи в часах должен быть больше нуля`);
      return { type, title: str(r.title, `Действие ${n}: название задачи`), assignee: str(r.assignee, "", false) || "manager", dueInHours };
    }
    case "send_invoice": return { type, channel: channel() };
    case "send_payment_link": return { type, channel: channel() };
    case "send_to_edo": return { type };
    case "handoff": {
      const kind = String(r.pipelineKind ?? "shipping");
      if (!["shipping", "service", "production"].includes(kind)) throw new Error(`Действие ${n}: неизвестная воронка`);
      return { type, pipelineKind: kind as "shipping" | "service" | "production" };
    }
    case "notify_user": return { type, who: r.who === "owner" ? "owner" : "manager", text: str(r.text, `Действие ${n}: текст уведомления`) };
    case "metrika_goal": return { type, goal: str(r.goal, `Действие ${n}: цель`) };
    case "ai_reply": return { type };
    case "sync_finance": return { type };
    case "move_stage": return { type, stageName: str(r.stageName, `Действие ${n}: этап`) };
  }
}

function normalizeCondition(raw: AutomationCondition, idx: number): AutomationCondition {
  const field = str(raw.field, `Условие ${idx + 1}: поле`);
  if (!OPS.includes(raw.op)) throw new Error(`Условие ${idx + 1}: неизвестный оператор`);
  let value: AutomationCondition["value"] = raw.value;
  if (raw.op === "in") value = (Array.isArray(raw.value) ? raw.value : String(raw.value).split(",")).map((x) => String(x).trim()).filter(Boolean);
  else if (raw.op === "gt" || raw.op === "lt") {
    const num = Number(String(raw.value).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(num)) throw new Error(`Условие ${idx + 1}: значение должно быть числом`);
    value = num;
  } else value = String(raw.value ?? "").trim();
  return { field, op: raw.op, value };
}

export async function saveAutomation(input: AutomationInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "automations", input.id ? "edit" : "create")) return fail("Нет прав на изменение автоматизаций");
  try {
    const name = str(input.name, "Название");
    if (!(input.event in EVENT_LABELS)) return fail("Выберите событие");
    const conditions = (input.conditions ?? []).map(normalizeCondition);
    const actions = (input.actions ?? []).map(normalizeAction);
    if (!actions.length) return fail("Добавьте хотя бы одно действие");
    const values = { name, description: input.description?.trim() || null, event: input.event, conditions, actions, isActive: input.isActive ?? true };
    if (input.id) {
      const existing = await db.query.automations.findFirst({ where: eq(schema.automations.id, input.id) });
      if (!existing) return fail("Автоматизация не найдена");
      await db.update(schema.automations).set(values).where(eq(schema.automations.id, input.id));
      await audit(user.id, "automation", input.id, "update", { name, event: input.event, actions: actions.map((a) => a.type) });
      revalidatePath("/automations");
      revalidatePath(`/automations/${input.id}`);
      return { ok: true, id: input.id };
    }
    const id = newId("auto");
    await db.insert(schema.automations).values({ id, ...values });
    await audit(user.id, "automation", id, "create", { name, event: input.event });
    revalidatePath("/automations");
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function toggleAutomation(id: string, isActive: boolean): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "automations", "edit")) return fail("Нет прав на изменение автоматизаций");
  try {
    await db.update(schema.automations).set({ isActive }).where(eq(schema.automations.id, id));
    await audit(user.id, "automation", id, "update", { isActive });
    revalidatePath("/automations");
    revalidatePath(`/automations/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteAutomation(id: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "automations", "delete")) return fail("Нет прав на удаление автоматизаций");
  try {
    await db.delete(schema.automations).where(eq(schema.automations.id, id));
    await audit(user.id, "automation", id, "delete");
    revalidatePath("/automations");
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function duplicateAutomation(id: string): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "automations", "create")) return fail("Нет прав на создание автоматизаций");
  try {
    const src = await db.query.automations.findFirst({ where: eq(schema.automations.id, id) });
    if (!src) return fail("Автоматизация не найдена");
    const newIdValue = newId("auto");
    await db.insert(schema.automations).values({ id: newIdValue, name: `${src.name} (копия)`, description: src.description, event: src.event, conditions: src.conditions, actions: src.actions, isActive: false });
    await audit(user.id, "automation", newIdValue, "create", { copiedFrom: id });
    revalidatePath("/automations");
    return { ok: true, id: newIdValue };
  } catch (e) {
    return fail(msg(e));
  }
}

export type TestRunResult = { ok: true; event: AutomationEvent; results: { automationId: string; name: string; status: "ok" | "error" | "skipped"; log: string[] }[]; warning?: string } | Fail;

/** Проверка на сделке: запускаем событие правила с реальным контекстом сделки — в демо-режиме действия только логируются */
export async function testAutomation(id: string, dealId: string): Promise<TestRunResult> {
  const user = await requireUser();
  if (!can(user.actor, "automations", "edit")) return fail("Нет прав на запуск автоматизаций");
  try {
    const rule = await db.query.automations.findFirst({ where: eq(schema.automations.id, id) });
    if (!rule) return fail("Автоматизация не найдена");
    const deal = await db.query.deals.findFirst({ where: eq(schema.deals.id, dealId) });
    if (!deal) return fail("Сделка не найдена");
    const [stage, pipeline] = await Promise.all([db.query.stages.findFirst({ where: eq(schema.stages.id, deal.stageId) }), db.query.pipelines.findFirst({ where: eq(schema.pipelines.id, deal.pipelineId) })]);
    const results = await runAutomations(rule.event, { dealId: deal.id, companyId: deal.companyId, contactId: deal.contactId, userId: user.id, amount: deal.amount, source: deal.source, toStage: stage?.name ?? null, fromStage: null, pipelineKind: pipeline?.kind ?? null });
    const names = new Map((await db.select({ id: schema.automations.id, name: schema.automations.name }).from(schema.automations)).map((r) => [r.id, r.name]));
    await audit(user.id, "automation", id, "view", { test: true, dealId });
    revalidatePath("/automations");
    revalidatePath(`/automations/${id}`);
    revalidatePath("/");
    return {
      ok: true,
      event: rule.event,
      results: results.map((r) => ({ ...r, name: names.get(r.automationId) ?? "—" })),
      warning: rule.isActive ? undefined : "Правило выключено, поэтому не сработало. Включите его и повторите проверку.",
    };
  } catch (e) {
    return fail(msg(e));
  }
}
