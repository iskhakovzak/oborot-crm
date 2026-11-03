import { and, eq, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AutomationAction, AutomationCondition, AutomationEvent } from "@/db/schema";
import type { EventPayload } from "@/lib/events";
import { newId } from "@/lib/utils";
import { buildContext, render } from "./templates";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/format";

type Ctx = Awaited<ReturnType<typeof buildContext>>;

function getField(payload: EventPayload, ctx: Ctx, field: string): unknown {
  if (field in payload) return (payload as Record<string, unknown>)[field];
  return field.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), ctx);
}
function test(c: AutomationCondition, v: unknown): boolean {
  const s = v == null ? "" : String(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  switch (c.op) {
    case "eq": return s.toLowerCase() === String(c.value).toLowerCase();
    case "neq": return s.toLowerCase() !== String(c.value).toLowerCase();
    case "gt": return n > Number(c.value);
    case "lt": return n < Number(c.value);
    case "contains": return s.toLowerCase().includes(String(c.value).toLowerCase());
    case "in": return (Array.isArray(c.value) ? c.value : [c.value]).map(String).map((x) => x.toLowerCase()).includes(s.toLowerCase());
  }
}

export async function runAutomations(event: AutomationEvent, payload: EventPayload) {
  const rules = await db.select().from(schema.automations).where(and(eq(schema.automations.event, event), eq(schema.automations.isActive, true))).orderBy(asc(schema.automations.createdAt));
  const results: { automationId: string; status: "ok" | "error" | "skipped"; log: string[] }[] = [];
  if (!rules.length) return results;
  const ctx = await buildContext(payload);
  for (const rule of rules) {
    const log: string[] = [];
    let status: "ok" | "error" | "skipped" = "ok";
    try {
      const pass = (rule.conditions ?? []).every((c) => test(c, getField(payload, ctx, c.field)));
      if (!pass) { status = "skipped"; log.push("Условия не выполнены"); }
      else for (const a of rule.actions) log.push(await runAction(a, payload, ctx));
    } catch (e) {
      status = "error"; log.push(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    }
    await db.insert(schema.automationRuns).values({ id: newId("run"), automationId: rule.id, event, entityId: payload.dealId ?? payload.companyId ?? payload.documentId ?? null, status, log });
    if (status === "ok") await db.update(schema.automations).set({ runsCount: rule.runsCount + 1, lastRunAt: new Date().toISOString() }).where(eq(schema.automations.id, rule.id));
    results.push({ automationId: rule.id, status, log });
  }
  return results;
}

export async function runAction(a: AutomationAction, p: EventPayload, ctx: Ctx): Promise<string> {
  switch (a.type) {
    case "send_message": {
      const { sendMessage } = await import("@/lib/integrations/messaging");
      const r = await sendMessage({ channel: a.channel, text: render(a.template, ctx), companyId: p.companyId, contactId: p.contactId, dealId: p.dealId, isAutomation: true });
      return r.ok ? `Сообщение отправлено (${r.channel}${r.sandbox ? ", демо" : ""})` : `Не отправлено: ${r.error}`;
    }
    case "send_sms": {
      const { sendSms } = await import("@/lib/integrations/sms");
      const phone = ctx.contact.phone || ctx.client.phone;
      if (!phone) return "SMS: нет телефона";
      const r = await sendSms(phone, render(a.template, ctx));
      await logActivity({ type: "message", title: "Автоотправка SMS", body: render(a.template, ctx), dealId: p.dealId, companyId: p.companyId, contactId: p.contactId });
      return r.ok ? `SMS отправлено на ${phone}${r.sandbox ? " (демо)" : ""}` : `SMS не отправлено: ${r.error}`;
    }
    case "send_email": {
      const { sendEmail } = await import("@/lib/integrations/email");
      const to = ctx.client.email;
      if (!to) return "Email: нет адреса";
      const r = await sendEmail({ to, subject: render(a.subject, ctx), text: render(a.template, ctx) });
      return r.ok ? `Письмо отправлено на ${to}${r.sandbox ? " (демо)" : ""}` : `Письмо не отправлено: ${r.error}`;
    }
    case "call_client": {
      const { placeCall } = await import("@/lib/integrations/telephony");
      const phone = ctx.contact.phone || ctx.client.phone;
      if (!phone) return "Звонок: нет телефона";
      const r = await placeCall({ phone, dealId: p.dealId, companyId: p.companyId, contactId: p.contactId, byAi: true, script: a.script ? render(a.script, ctx) : undefined });
      return `Автозвонок клиенту ${phone}: ${r.status}${r.sandbox ? " (демо)" : ""}`;
    }
    case "create_task": {
      let assigneeId: string | null = null;
      if (a.assignee === "manager" && p.dealId) assigneeId = (await db.query.deals.findFirst({ where: eq(schema.deals.id, p.dealId) }))?.managerId ?? null;
      else if (a.assignee === "creator") assigneeId = p.userId ?? null;
      else if (a.assignee && a.assignee !== "manager") assigneeId = a.assignee;
      if (!assigneeId && p.companyId) assigneeId = (await db.query.companies.findFirst({ where: eq(schema.companies.id, p.companyId) }))?.managerId ?? null;
      if (!assigneeId) assigneeId = (await db.query.users.findFirst({ where: eq(schema.users.isActive, true) }))?.id ?? null;
      const id = newId("task");
      await db.insert(schema.tasks).values({ id, title: render(a.title, ctx), assigneeId, creatorId: p.userId ?? null, dealId: p.dealId ?? null, companyId: p.companyId ?? null, dueAt: new Date(Date.now() + a.dueInHours * 3600_000).toISOString(), source: "automation", priority: a.dueInHours <= 2 ? "high" : "normal" });
      return `Создана задача «${render(a.title, ctx)}»`;
    }
    case "send_invoice": {
      const { createDocument } = await import("@/lib/documents/service");
      if (!p.dealId) return "Счёт: нет сделки";
      const doc = p.documentId && (await db.query.documents.findFirst({ where: eq(schema.documents.id, p.documentId) }))?.type === "invoice" ? { id: p.documentId } : await createDocument({ type: "invoice", dealId: p.dealId, userId: p.userId });
      const { sendDocument } = await import("@/lib/documents/service");
      const r = await sendDocument(doc.id, a.channel, p.userId);
      return r.ok ? `Счёт отправлен (${r.channel}${r.sandbox ? ", демо" : ""})` : `Счёт не отправлен: ${r.error}`;
    }
    case "send_payment_link": {
      const { createPaymentLink } = await import("@/lib/integrations/sbp");
      const amount = p.amount ?? Number(ctx.deal.amount.replace(/[^\d]/g, "")) ?? 0;
      if (!amount) return "Ссылка на оплату: нулевая сумма";
      const link = await createPaymentLink({ amount, purpose: `Оплата по сделке №${ctx.deal.number}`, dealId: p.dealId, documentId: p.documentId, companyId: p.companyId });
      const { sendMessage } = await import("@/lib/integrations/messaging");
      const r = await sendMessage({ channel: a.channel, text: `Ссылка на оплату (Payme/Click): ${link.url}\nСумма: ${fmtMoney(amount)}`, companyId: p.companyId, contactId: p.contactId, dealId: p.dealId, isAutomation: true });
      return r.ok ? `Ссылка на оплату отправлена (${r.channel})` : `Ссылка создана, но не отправлена: ${r.error}`;
    }
    case "send_to_edo": {
      const { sendToEdo } = await import("@/lib/integrations/edo");
      if (!p.documentId) return "ЭДО: нет документа";
      const r = await sendToEdo(p.documentId, p.userId);
      return `Отправлено в ЭДО (${r.edoId}${r.sandbox ? ", демо" : ""})`;
    }
    case "handoff": {
      const { handoffDeal } = await import("@/lib/handoff");
      if (!p.dealId) return "Передача: нет сделки";
      const r = await handoffDeal(p.dealId, a.pipelineKind, p.userId);
      return `Передано в ${a.pipelineKind} (№${r.number})`;
    }
    case "notify_user": {
      const { notifyUser } = await import("@/lib/notify");
      let userId: string | null = null;
      if (a.who === "manager" && p.dealId) userId = (await db.query.deals.findFirst({ where: eq(schema.deals.id, p.dealId) }))?.managerId ?? null;
      if (!userId) userId = (await db.query.users.findFirst({ where: eq(schema.users.roleId, (await db.query.roles.findFirst({ where: eq(schema.roles.slug, "admin") }))?.id ?? "") }))?.id ?? null;
      if (!userId) return "Уведомление: некому";
      await notifyUser(userId, render(a.text, ctx));
      return "Уведомление отправлено сотруднику";
    }
    case "metrika_goal": {
      const { sendConversion } = await import("@/lib/integrations/metrika");
      if (!p.dealId) return "Метрика: нет сделки";
      const r = await sendConversion({ dealId: p.dealId, goal: a.goal, revenue: p.amount });
      return r.ok ? `Конверсия «${a.goal}» передана${r.sandbox ? " (демо)" : ""}` : `Метрика: ${r.message}`;
    }
    case "ai_reply": {
      if (!p.conversationId) return "ИИ-ответ: нет переписки";
      const { aiReplyToConversation } = await import("@/lib/ai-chat");
      const r = await aiReplyToConversation(p.conversationId);
      return r.sent ? `ИИ ответил клиенту${r.handoff ? " и передал менеджеру" : ""}` : r.reason;
    }
    case "sync_finance": {
      const { syncToFinance } = await import("@/lib/integrations/finance");
      if (p.paymentId) return (await syncToFinance("payment", p.paymentId)).message;
      if (p.documentId) return (await syncToFinance("document", p.documentId)).message;
      return "Финучёт: нечего синхронизировать";
    }
    case "move_stage": {
      if (!p.dealId) return "Этап: нет сделки";
      const deal = await db.query.deals.findFirst({ where: eq(schema.deals.id, p.dealId) });
      if (!deal) return "Сделка не найдена";
      const st = await db.query.stages.findFirst({ where: and(eq(schema.stages.pipelineId, deal.pipelineId), eq(schema.stages.name, a.stageName)) });
      if (!st) return `Этап «${a.stageName}» не найден`;
      await db.update(schema.deals).set({ stageId: st.id, stageEnteredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(schema.deals.id, deal.id));
      await logActivity({ type: "stage", title: `Этап изменён автоматически: ${a.stageName}`, dealId: deal.id, companyId: deal.companyId });
      return `Сделка переведена на «${a.stageName}»`;
    }
  }
}

export const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  send_message: "Написать клиенту в мессенджер",
  send_sms: "Отправить SMS",
  send_email: "Отправить письмо",
  call_client: "Автоматический звонок клиенту",
  create_task: "Поставить задачу сотруднику",
  send_invoice: "Выставить и отправить счёт",
  send_payment_link: "Отправить ссылку на оплату (Payme/Click)",
  send_to_edo: "Отправить документ в ЭДО (Didox)",
  handoff: "Передать в отгрузку / услуги / производство",
  notify_user: "Уведомить сотрудника",
  metrika_goal: "Передать конверсию в Метрику",
  ai_reply: "Ответить клиенту с помощью ИИ",
  sync_finance: "Синхронизировать с финучётом",
  move_stage: "Перевести сделку на этап",
};
export const EVENT_LABELS: Record<AutomationEvent, string> = {
  "deal.created": "Создана сделка",
  "deal.stage_changed": "Сделка сменила этап",
  "deal.won": "Сделка выиграна",
  "deal.lost": "Сделка проиграна",
  "lead.created": "Поступила заявка",
  "invoice.created": "Выставлен счёт",
  "upd.created": "Сформирована ЭСФ",
  "payment.received": "Поступила оплата",
  "booking.created": "Клиент записался в календарь",
  "message.received": "Входящее сообщение от клиента",
  "call.missed": "Пропущенный звонок",
  "task.overdue": "Просрочена задача",
};
