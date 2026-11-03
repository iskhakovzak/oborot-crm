import type { AutomationAction, AutomationCondition, AutomationEvent } from "@/db/schema";

export type AutomationRow = {
  id: string;
  name: string;
  description: string | null;
  event: AutomationEvent;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
  runsCount: number;
  lastRunAt: string | null;
  lastRunLabel: string;
};

export type Option = { id: string; name: string };

/** Подписи из движка автоматизаций — передаются с сервера, чтобы клиент не тянул серверные модули */
export type Labels = { events: Record<AutomationEvent, string>; actions: Record<AutomationAction["type"], string>; vars: string[] };

/** Черновик действия в редакторе: все поля строками, типизируется на сервере */
export type ActionDraft = {
  type: AutomationAction["type"];
  channel?: string;
  template?: string;
  subject?: string;
  script?: string;
  title?: string;
  assignee?: string;
  dueInHours?: string;
  pipelineKind?: string;
  who?: string;
  text?: string;
  goal?: string;
  stageName?: string;
};

export type ConditionDraft = { field: string; op: AutomationCondition["op"]; value: string };

export const CHANNEL_OPTIONS = [
  { value: "preferred", label: "Где клиент уже писал (авто)" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "max", label: "MAX" },
  { value: "vk", label: "ВКонтакте" },
  { value: "email", label: "Почта" },
  { value: "sms", label: "SMS" },
];

export const OP_LABELS: Record<AutomationCondition["op"], string> = { eq: "равно", neq: "не равно", gt: "больше", lt: "меньше", contains: "содержит", in: "одно из" };

export const CONDITION_FIELDS = [
  { value: "deal.amount", label: "Сумма сделки" },
  { value: "deal.stage", label: "Этап сделки" },
  { value: "toStage", label: "Новый этап (при смене)" },
  { value: "fromStage", label: "Прошлый этап (при смене)" },
  { value: "source", label: "Источник заявки" },
  { value: "client.name", label: "Название клиента" },
  { value: "deal.manager", label: "Менеджер сделки" },
  { value: "amount", label: "Сумма события (оплата/счёт)" },
  { value: "pipelineKind", label: "Тип воронки (sales/shipping/service/production)" },
];

export function actionToDraft(a: AutomationAction): ActionDraft {
  const r = a as unknown as Record<string, unknown>;
  const s = (k: string) => (r[k] == null ? undefined : String(r[k]));
  return { type: a.type, channel: s("channel"), template: s("template"), subject: s("subject"), script: s("script"), title: s("title"), assignee: s("assignee"), dueInHours: s("dueInHours"), pipelineKind: s("pipelineKind"), who: s("who"), text: s("text"), goal: s("goal"), stageName: s("stageName") };
}

export function draftToAction(d: ActionDraft): AutomationAction {
  // сервер валидирует и типизирует; здесь только собираем объект нужной формы
  const out: Record<string, unknown> = { type: d.type };
  for (const k of ["channel", "template", "subject", "script", "title", "assignee", "pipelineKind", "who", "text", "goal", "stageName"] as const) if (d[k] !== undefined && d[k] !== "") out[k] = d[k];
  if (d.dueInHours !== undefined) out.dueInHours = Number(d.dueInHours);
  return out as unknown as AutomationAction;
}

export function conditionToDraft(c: AutomationCondition): ConditionDraft {
  return { field: c.field, op: c.op, value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "") };
}

export function describeCondition(c: AutomationCondition) {
  const f = CONDITION_FIELDS.find((x) => x.value === c.field)?.label ?? c.field;
  const v = Array.isArray(c.value) ? c.value.join(", ") : String(c.value);
  return `${f} ${OP_LABELS[c.op]} ${v}`;
}

/** Короткая подпись действия для чипа в списке */
export function actionSummary(a: AutomationAction): string | null {
  switch (a.type) {
    case "send_message": return CHANNEL_OPTIONS.find((c) => c.value === a.channel)?.label?.replace(" (авто)", "") ?? a.channel;
    case "send_email": return a.subject;
    case "create_task": return `${a.title.slice(0, 40)}${a.title.length > 40 ? "…" : ""} · ${a.dueInHours} ч`;
    case "handoff": return { shipping: "отгрузка", service: "услуги", production: "производство" }[a.pipelineKind];
    case "metrika_goal": return a.goal;
    case "move_stage": return a.stageName;
    case "notify_user": return a.who === "owner" ? "владельцу" : "менеджеру";
    default: return null;
  }
}
