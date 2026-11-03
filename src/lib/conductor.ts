import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { executeCommand, type CommandLink } from "@/lib/telegram-bot";
import { ask, heuristicIntent } from "@/lib/integrations/ai";
import { fmtMoney, plural, relTime } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

export type ConductorMessage = { role: "user" | "conductor"; text: string };
export type ConductorAction = { label: string; href: string };
export type ConductorResult = { kind: "action" | "answer"; text: string; actions: ConductorAction[]; ok: boolean; sandbox: boolean };

const QUESTION_START = /^(что|какие|какой|какая|сколько|почему|как|кто|когда|где|есть ли|расскажи|объясни|подскажи|нужно ли|стоит ли)\b/i;
/** Команды, которые допустимо формулировать вопросом: «сколько продали за неделю?», «мои задачи?» */
const QUESTION_SAFE = new Set(["stats", "my_tasks", "find"]);

/** Похож ли текст на команду (создать/перевести/выставить…), а не на вопрос по данным */
export function looksLikeCommand(text: string): boolean {
  const t = text.trim();
  const l = t.toLowerCase();
  if (/^\/?(help|start|помощь|команды)\b/.test(l)) return true;
  const intent = heuristicIntent(t).intent;
  const isQuestion = /\?\s*$/.test(t) || QUESTION_START.test(t);
  if (/(выстав|отправ|выпиш)[а-яё]*\s+сч[её]т/.test(l) && !isQuestion) return true;
  if (intent === "unknown") return false;
  if (isQuestion) return QUESTION_SAFE.has(intent);
  return true;
}

type Context = {
  openDeals: { n: number; sum: number };
  overdueTasks: number;
  myOpenTasks: number;
  unread: number;
  revenueMonth: { n: number; sum: number };
  newDealsWeek: number;
  recent: { title: string; when: string }[];
};

async function collectContext(user: SessionUser): Promise<Context> {
  const now = new Date();
  const nowIso = now.toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const [open] = await db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(amount),0)` }).from(schema.deals).where(eq(schema.deals.status, "open"));
  const [overdue] = await db.select({ n: sql<number>`count(*)` }).from(schema.tasks).where(and(eq(schema.tasks.status, "open"), lt(schema.tasks.dueAt, nowIso)));
  const [mine] = await db.select({ n: sql<number>`count(*)` }).from(schema.tasks).where(and(eq(schema.tasks.status, "open"), eq(schema.tasks.assigneeId, user.id)));
  const [unread] = await db.select({ n: sql<number>`coalesce(sum(unread),0)` }).from(schema.conversations).where(eq(schema.conversations.status, "open"));
  const [won] = await db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(amount),0)` }).from(schema.deals).where(and(eq(schema.deals.status, "won"), gte(schema.deals.closedAt, monthStart)));
  const [fresh] = await db.select({ n: sql<number>`count(*)` }).from(schema.deals).where(gte(schema.deals.createdAt, weekAgo));
  const acts = await db.select({ title: schema.activities.title, createdAt: schema.activities.createdAt }).from(schema.activities).orderBy(desc(schema.activities.createdAt)).limit(5);
  return {
    openDeals: { n: Number(open?.n ?? 0), sum: Number(open?.sum ?? 0) },
    overdueTasks: Number(overdue?.n ?? 0),
    myOpenTasks: Number(mine?.n ?? 0),
    unread: Number(unread?.n ?? 0),
    revenueMonth: { n: Number(won?.n ?? 0), sum: Number(won?.sum ?? 0) },
    newDealsWeek: Number(fresh?.n ?? 0),
    recent: acts.map((a) => ({ title: a.title, when: relTime(a.createdAt) })),
  };
}

function contextText(c: Context): string {
  return [
    `Открытых сделок: ${c.openDeals.n} на ${fmtMoney(c.openDeals.sum)}`,
    `Новых сделок за 7 дней: ${c.newDealsWeek}`,
    `Выручка за текущий месяц: ${fmtMoney(c.revenueMonth.sum)} (${plural(c.revenueMonth.n, "сделка", "сделки", "сделок")} выиграно)`,
    `Просроченных задач: ${c.overdueTasks}`,
    `Непрочитанных сообщений в переписках: ${c.unread}`,
    `Последние события: ${c.recent.length ? c.recent.map((r) => `${r.title} (${r.when})`).join("; ") : "нет"}`,
  ].join("\n");
}

/** Ответ без ключа ИИ: шаблон по сводке из базы */
function demoAnswer(text: string, c: Context, user: SessionUser): { text: string; actions: ConductorAction[] } {
  const l = text.toLowerCase();
  const attention: string[] = [];
  const actions: ConductorAction[] = [];
  if (c.overdueTasks) { attention.push(`просрочено ${plural(c.overdueTasks, "задача", "задачи", "задач")}`); actions.push({ label: "Задачи", href: "/tasks" }); }
  if (c.unread) { attention.push(`${plural(c.unread, "непрочитанное сообщение", "непрочитанных сообщения", "непрочитанных сообщений")} в переписках`); actions.push({ label: "Переписки", href: "/inbox" }); }
  if (/внимани|срочн|горит|проблем|риск/.test(l)) {
    return { text: attention.length ? `Требует внимания: ${attention.join(", ")}. В работе ${plural(c.openDeals.n, "сделка", "сделки", "сделок")} на ${fmtMoney(c.openDeals.sum)}.` : `Срочного ничего нет: просроченных задач и непрочитанных сообщений нет. В работе ${plural(c.openDeals.n, "сделка", "сделки", "сделок")} на ${fmtMoney(c.openDeals.sum)}.`, actions };
  }
  if (/задач/.test(l)) {
    return { text: `У вас ${plural(c.myOpenTasks, "открытая задача", "открытые задачи", "открытых задач")}, по компании просрочено ${c.overdueTasks}. Напишите «мои задачи» — покажу список.`, actions: [{ label: "Задачи", href: "/tasks" }] };
  }
  if (/выручк|продаж|доход|месяц/.test(l)) {
    return { text: `Выручка за месяц — ${fmtMoney(c.revenueMonth.sum)} (${plural(c.revenueMonth.n, "сделка", "сделки", "сделок")}). Новых сделок за неделю ${c.newDealsWeek}, в работе ${c.openDeals.n} на ${fmtMoney(c.openDeals.sum)}.`, actions: [{ label: "Аналитика", href: "/analytics" }] };
  }
  if (/сделк|воронк|пайплайн|pipeline/.test(l)) {
    return { text: `Открытых сделок ${c.openDeals.n} на ${fmtMoney(c.openDeals.sum)}, новых за неделю ${c.newDealsWeek}. Выиграно за месяц ${plural(c.revenueMonth.n, "сделка", "сделки", "сделок")} на ${fmtMoney(c.revenueMonth.sum)}.`, actions: [{ label: "Сделки", href: "/deals" }] };
  }
  if (/сообщен|перепис|чат|клиент.*пиш/.test(l)) {
    return { text: `Непрочитанных сообщений: ${c.unread}.`, actions: [{ label: "Переписки", href: "/inbox" }] };
  }
  if (/событ|активност|что нового|последн/.test(l)) {
    return { text: c.recent.length ? `Последние события:\n${c.recent.map((r, i) => `${i + 1}. ${r.title} — ${r.when}`).join("\n")}` : "Событий в журнале пока нет.", actions: [] };
  }
  const first = user.name.split(" ")[0];
  return {
    text: `${first}, вот сводка: открытых сделок ${c.openDeals.n} на ${fmtMoney(c.openDeals.sum)}, просрочено ${plural(c.overdueTasks, "задача", "задачи", "задач")}, непрочитанных сообщений ${c.unread}, выручка за месяц ${fmtMoney(c.revenueMonth.sum)}. Без ключа ИИ отвечаю по сводке; командами могу создать сделку, задачу или клиента, перевести сделку на этап и выставить счёт.`,
    actions,
  };
}

const SYSTEM = `Ты — Кондуктор WS_CRM: ИИ-оператор внутри CRM-системы компании. Отвечаешь сотруднику по-русски, коротко и по делу (2–5 предложений), опираясь только на сводку данных ниже. Цифры называй точно, как в сводке, деньги — в сумах. Если данных не хватает, скажи об этом и предложи команду (например «мои задачи», «найди <клиент>», «продажи за неделю»). Не придумывай факты.`;

/** Кондуктор: команда → выполнение через executeCommand, вопрос → ответ ИИ по сводке из базы */
export async function runConductor({ text, user, history = [] }: { text: string; user: SessionUser; history?: ConductorMessage[] }): Promise<ConductorResult> {
  const clean = text.trim();
  if (!clean) return { kind: "answer", text: "Напишите команду или вопрос.", actions: [], ok: false, sandbox: true };

  if (looksLikeCommand(clean)) {
    const r = await executeCommand(clean, { id: user.id, name: user.name }, "conductor");
    const actions: ConductorAction[] = (r.links ?? []).map((l: CommandLink) => ({ label: l.label, href: l.href }));
    return { kind: "action", text: r.text, actions, ok: r.ok, sandbox: r.sandbox };
  }

  const ctx = await collectContext(user);
  const recent = history.slice(-10).map((m) => `${m.role === "user" ? "Сотрудник" : "Кондуктор"}: ${m.text}`).join("\n");
  const prompt = `Сотрудник: ${user.name} (${user.roleName}).\n\nСводка CRM:\n${contextText(ctx)}${recent ? `\n\nПредыдущие сообщения:\n${recent}` : ""}\n\nВопрос сотрудника: ${clean}`;
  const ai = await ask(SYSTEM, prompt, { maxTokens: 700 });
  if (!ai.sandbox && ai.text) return { kind: "answer", text: ai.text, actions: [], ok: true, sandbox: false };
  const demo = demoAnswer(clean, ctx, user);
  return { kind: "answer", text: demo.text, actions: demo.actions, ok: true, sandbox: true };
}
