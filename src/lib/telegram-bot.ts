import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./utils";
import { nextNumber } from "./counters";
import { emit } from "./events";
import { logActivity } from "./activity";
import { parseBotCommand, type BotIntent } from "./integrations/ai";
import { createDocument, sendDocument } from "./documents/service";
import { fmtMoney, fmtDateTime, plural } from "./format";
import { can, type Actor } from "./permissions";
import { startOfDayTz } from "@/lib/format";

export type BotUser = { id: string; name: string };
export type CommandResult = { ok: boolean; text: string; intent: BotIntent["intent"]; status: "ok" | "error" | "unknown"; sandbox: boolean };

export const BOT_EXAMPLES = [
  "создай сделку Кондиционеры в офис для Кофейня №1 на 120 000",
  "поставь задачу на Ивана позвонить в Агроресурс завтра",
  "создай клиента ООО «Ромашка» ИНН 7707083893",
  "переведи сделку 1003 в Переговоры",
  "выставь счёт по сделке 1003",
  "продажи за неделю",
  "мои задачи",
  "найди Технострой",
  "заметка к сделке 1003: клиент просит монтаж в субботу",
];

export const BOT_HELP = `Я понимаю команды на обычном языке. Примеры:\n${BOT_EXAMPLES.map((e) => `• ${e}`).join("\n")}`;

/** Первая открытая стадия воронки продаж */
export async function firstSalesStage() {
  const pipeline = await db.query.pipelines.findFirst({ where: eq(schema.pipelines.kind, "sales"), orderBy: asc(schema.pipelines.order) });
  if (!pipeline) throw new Error("Воронка продаж не настроена");
  const stage = await db.query.stages.findFirst({ where: and(eq(schema.stages.pipelineId, pipeline.id), eq(schema.stages.kind, "open")), orderBy: asc(schema.stages.order) });
  if (!stage) throw new Error("В воронке продаж нет открытых этапов");
  return { pipeline, stage };
}

/** Быстрое создание сделки в первой стадии продаж: из переписки, звонка ИИ или команды бота. Генерирует события deal.created и lead.created. */
export async function createDealQuick(p: { title: string; companyId?: string | null; contactId?: string | null; amount?: number; managerId?: string | null; source?: string | null; userId?: string | null }) {
  const { pipeline, stage } = await firstSalesStage();
  const company = p.companyId ? await db.query.companies.findFirst({ where: eq(schema.companies.id, p.companyId) }) : null;
  const contactId = p.contactId ?? (p.companyId ? (await db.query.contacts.findFirst({ where: eq(schema.contacts.companyId, p.companyId) }))?.id ?? null : null);
  const number = await nextNumber("deal");
  const id = newId("deal");
  const managerId = p.managerId ?? company?.managerId ?? p.userId ?? null;
  await db.insert(schema.deals).values({ id, number, title: p.title, companyId: p.companyId ?? null, contactId, pipelineId: pipeline.id, stageId: stage.id, amount: p.amount ?? 0, managerId, status: "open", source: p.source ?? company?.source ?? null, utm: company?.utm ?? null });
  await logActivity({ type: "system", title: `Сделка №${number} создана${p.source ? ` из источника «${p.source}»` : ""}`, dealId: id, companyId: p.companyId, contactId, userId: p.userId });
  const payload = { dealId: id, companyId: p.companyId ?? null, contactId, userId: p.userId ?? null, amount: p.amount ?? 0, source: p.source ?? null, pipelineKind: "sales" };
  await emit("deal.created", payload);
  await emit("lead.created", payload);
  return { id, number, stageName: stage.name, managerId };
}

async function loadActor(userId: string): Promise<Actor | null> {
  const row = await db.select({ user: schema.users, role: schema.roles }).from(schema.users).innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id)).where(eq(schema.users.id, userId)).then((r) => r[0]);
  if (!row) return null;
  return { id: row.user.id, teamId: row.user.teamId, permissions: row.role.permissions, isAdmin: row.role.slug === "admin" };
}

async function findCompany(q: string) {
  const clean = q.replace(/[«»"]/g, "").trim();
  if (!clean) return null;
  const exact = await db.query.companies.findFirst({ where: or(ilike(schema.companies.name, `%${clean}%`), ilike(schema.companies.shortName, `%${clean}%`), eq(schema.companies.inn, clean)) });
  if (exact) return exact;
  const words = clean.split(/\s+/).filter((w) => w.length > 3);
  for (const w of words) {
    const c = await db.query.companies.findFirst({ where: ilike(schema.companies.name, `%${w}%`) });
    if (c) return c;
  }
  return null;
}

async function findDeal(q: string) {
  const num = q.match(/№?\s*(\d{3,})/)?.[1];
  if (num) {
    const d = await db.query.deals.findFirst({ where: eq(schema.deals.number, Number(num)) });
    if (d) return d;
  }
  const clean = q.replace(/^(сделк[ауе]|по)\s+/i, "").replace(/[«»"]/g, "").trim();
  const byTitle = await db.query.deals.findFirst({ where: and(ilike(schema.deals.title, `%${clean}%`), eq(schema.deals.status, "open")), orderBy: desc(schema.deals.updatedAt) });
  if (byTitle) return byTitle;
  const company = await findCompany(clean);
  if (company) return db.query.deals.findFirst({ where: and(eq(schema.deals.companyId, company.id), eq(schema.deals.status, "open")), orderBy: desc(schema.deals.updatedAt) });
  return null;
}

/** Сотрудник по имени в любом падеже: «Ивану», «Дениса», «Марии» */
async function findUser(name: string) {
  const base = name.trim();
  for (let cut = 0; cut <= 2 && base.length - cut >= 3; cut++) {
    const prefix = base.slice(0, base.length - cut);
    const u = await db.query.users.findFirst({ where: and(eq(schema.users.isActive, true), ilike(schema.users.name, `%${prefix}%`)) });
    if (u) return u;
  }
  return null;
}

function periodSince(period: "today" | "week" | "month") {
  const d = new Date();
  if (period === "today") return startOfDayTz(d).toISOString();
  else if (period === "week") d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  return d.toISOString();
}
const PERIOD_LABEL = { today: "сегодня", week: "за неделю", month: "за месяц" } as const;

/** Убирает из названия сделки хвосты «для <клиент>» и «на <сумма>», которые парсер мог оставить */
function cleanDealTitle(title: string, company?: string) {
  let t = title.trim();
  if (company) {
    const esc = company.replace(/[«»"]/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s+(?:для|с|от|клиент[ау]?)\\s+[«"]?${esc}[»"]?`, "i"), "");
  }
  t = t.replace(/\s+на\s+\d[\d\s]*\s*(сум\w*|uzs|₽|руб\w*|р|к|тыс\w*|млн)?\.?$/i, "").replace(/[,\s]+$/, "").trim();
  return t || "Новая сделка";
}

async function run(intent: BotIntent, user: BotUser, actor: Actor): Promise<{ ok: boolean; text: string }> {
  switch (intent.intent) {
    case "create_deal": {
      if (!can(actor, "deals", "create")) return { ok: false, text: "У вас нет права создавать сделки" };
      const company = intent.company ? await findCompany(intent.company) : null;
      if (intent.company && !company) return { ok: false, text: `Клиент «${intent.company}» не найден. Сначала создайте его: «создай клиента ${intent.company}»` };
      const title = cleanDealTitle(intent.title, intent.company);
      const d = await createDealQuick({ title, companyId: company?.id, amount: intent.amount, managerId: user.id, source: "Telegram-бот", userId: user.id });
      return { ok: true, text: `Сделка №${d.number} «${title}»${company ? ` для ${company.name}` : ""}${intent.amount ? ` на ${fmtMoney(intent.amount)}` : ""} создана, этап «${d.stageName}»` };
    }
    case "create_task": {
      if (!can(actor, "tasks", "create")) return { ok: false, text: "У вас нет права создавать задачи" };
      const assignee = intent.assignee ? await findUser(intent.assignee) : null;
      if (intent.assignee && !assignee) return { ok: false, text: `Сотрудник «${intent.assignee}» не найден` };
      const company = await findCompany(intent.title);
      const due = new Date(Date.now() + (intent.dueInHours ?? 24) * 3600_000);
      await db.insert(schema.tasks).values({ id: newId("task"), title: intent.title, assigneeId: assignee?.id ?? user.id, creatorId: user.id, companyId: company?.id ?? null, dueAt: due.toISOString(), priority: (intent.dueInHours ?? 24) <= 4 ? "high" : "normal", source: "telegram" });
      return { ok: true, text: `Задача «${intent.title}» создана. Исполнитель — ${assignee ? assignee.name : "вы"}, срок ${fmtDateTime(due.toISOString())}${company ? `, клиент ${company.name}` : ""}` };
    }
    case "create_company": {
      if (!can(actor, "companies", "create")) return { ok: false, text: "У вас нет права создавать клиентов" };
      const existing = intent.inn ? await db.query.companies.findFirst({ where: eq(schema.companies.inn, intent.inn) }) : null;
      if (existing) return { ok: false, text: `Клиент с ИНН ${intent.inn} уже есть: ${existing.name}` };
      const id = newId("cmp");
      await db.insert(schema.companies).values({ id, name: intent.name, shortName: intent.name.replace(/^(ООО|АО|ИП|ПАО)\s*/i, "").replace(/[«»"]/g, ""), inn: intent.inn ?? null, phone: intent.phone ?? null, status: "lead", source: "Telegram-бот", managerId: user.id });
      await logActivity({ type: "system", title: "Клиент создан через Telegram-бота", companyId: id, userId: user.id });
      return { ok: true, text: `Клиент ${/[«"]/.test(intent.name) ? intent.name : `«${intent.name}»`} создан${intent.inn ? `, ИНН ${intent.inn}` : ""}. Менеджер — ${user.name}` };
    }
    case "move_deal": {
      if (!can(actor, "deals", "edit")) return { ok: false, text: "У вас нет права менять сделки" };
      const deal = await findDeal(intent.deal);
      if (!deal) return { ok: false, text: `Сделка «${intent.deal}» не найдена` };
      const stages = await db.query.stages.findMany({ where: eq(schema.stages.pipelineId, deal.pipelineId) });
      const q = intent.stage.toLowerCase().replace(/[«»"]/g, "").trim();
      const stage = stages.find((s) => s.name.toLowerCase() === q) ?? stages.find((s) => s.name.toLowerCase().startsWith(q.slice(0, 5)));
      if (!stage) return { ok: false, text: `Этап «${intent.stage}» не найден. Доступны: ${stages.map((s) => s.name).join(", ")}` };
      const from = stages.find((s) => s.id === deal.stageId);
      const now = new Date().toISOString();
      await db.update(schema.deals).set({ stageId: stage.id, status: stage.kind, stageEnteredAt: now, updatedAt: now, closedAt: stage.kind === "open" ? null : now }).where(eq(schema.deals.id, deal.id));
      await logActivity({ type: "stage", title: `Этап: ${from?.name ?? "—"} → ${stage.name}`, body: "Через Telegram-бота", dealId: deal.id, companyId: deal.companyId, userId: user.id });
      const payload = { dealId: deal.id, companyId: deal.companyId, contactId: deal.contactId, userId: user.id, amount: deal.amount, fromStage: from?.name, toStage: stage.name };
      await emit("deal.stage_changed", payload);
      if (stage.kind === "won") await emit("deal.won", payload);
      if (stage.kind === "lost") await emit("deal.lost", payload);
      return { ok: true, text: `Сделка №${deal.number} «${deal.title}» переведена на этап «${stage.name}»` };
    }
    case "send_invoice": {
      if (!can(actor, "documents", "create")) return { ok: false, text: "У вас нет права выставлять счета" };
      const deal = await findDeal(intent.deal);
      if (!deal) return { ok: false, text: `Сделка «${intent.deal}» не найдена` };
      const doc = await createDocument({ type: "invoice", dealId: deal.id, userId: user.id });
      const r = await sendDocument(doc.id, "preferred", user.id);
      return { ok: true, text: `${doc.title} на ${fmtMoney(doc.amount)} по сделке №${deal.number} сформирован${r.ok ? ` и отправлен клиенту (${r.channel}${r.sandbox ? ", демо" : ""})` : `. Не отправлен: ${r.error}`}` };
    }
    case "stats": {
      if (!can(actor, "analytics", "view") && !can(actor, "deals", "view")) return { ok: false, text: "У вас нет доступа к статистике" };
      const since = periodSince(intent.period);
      const won = await db.query.deals.findMany({ where: and(eq(schema.deals.status, "won"), gte(schema.deals.closedAt, since)) });
      const created = await db.query.deals.findMany({ where: and(gte(schema.deals.createdAt, since)) });
      const [open] = await db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(amount),0)` }).from(schema.deals).where(eq(schema.deals.status, "open"));
      const byManager = new Map<string, number>();
      for (const d of won) if (d.managerId) byManager.set(d.managerId, (byManager.get(d.managerId) ?? 0) + d.amount);
      const bestId = [...byManager.entries()].sort((a, b) => b[1] - a[1])[0];
      const best = bestId ? await db.query.users.findFirst({ where: eq(schema.users.id, bestId[0]) }) : null;
      const revenue = won.reduce((s, d) => s + d.amount, 0);
      return { ok: true, text: `Продажи ${PERIOD_LABEL[intent.period]}: выиграно ${plural(won.length, "сделка", "сделки", "сделок")} на ${fmtMoney(revenue)}, новых заявок ${created.length}. В работе ${plural(open.n, "сделка", "сделки", "сделок")} на ${fmtMoney(open.sum)}.${best ? ` Лучший менеджер — ${best.name} (${fmtMoney(bestId![1])}).` : ""}` };
    }
    case "my_tasks": {
      const tasks = await db.query.tasks.findMany({ where: and(eq(schema.tasks.assigneeId, user.id), eq(schema.tasks.status, "open")), orderBy: asc(schema.tasks.dueAt), limit: 10 });
      if (!tasks.length) return { ok: true, text: "Открытых задач нет — отличная работа!" };
      const now = Date.now();
      return { ok: true, text: `Ваши задачи (${tasks.length}):\n${tasks.map((t, i) => `${i + 1}. ${t.title}${t.dueAt ? ` — ${fmtDateTime(t.dueAt)}${new Date(t.dueAt).getTime() < now ? " ⚠️ просрочена" : ""}` : ""}`).join("\n")}` };
    }
    case "find": {
      const q = `%${intent.query.replace(/[«»"]/g, "").trim()}%`;
      const companies = can(actor, "companies", "view") ? await db.query.companies.findMany({ where: or(ilike(schema.companies.name, q), ilike(schema.companies.inn, q), ilike(schema.companies.phone, q)), limit: 5 }) : [];
      const num = Number(intent.query.replace(/\D/g, ""));
      const deals = can(actor, "deals", "view") ? await db.query.deals.findMany({ where: or(ilike(schema.deals.title, q), num ? eq(schema.deals.number, num) : sql`false`), orderBy: desc(schema.deals.updatedAt), limit: 5 }) : [];
      if (!companies.length && !deals.length) return { ok: true, text: `По запросу «${intent.query}» ничего не найдено` };
      const lines: string[] = [];
      for (const c of companies) {
        const open = await db.query.deals.findMany({ where: and(eq(schema.deals.companyId, c.id), eq(schema.deals.status, "open")) });
        lines.push(`🏢 ${c.name}${c.inn ? ` (ИНН ${c.inn})` : ""} — ${c.phone ?? "без телефона"}, баланс ${fmtMoney(c.balance)}, открытых сделок: ${open.length}`);
      }
      for (const d of deals) {
        const stage = await db.query.stages.findFirst({ where: eq(schema.stages.id, d.stageId) });
        lines.push(`📄 Сделка №${d.number} «${d.title}» — ${fmtMoney(d.amount)}, этап «${stage?.name ?? "—"}»`);
      }
      return { ok: true, text: lines.join("\n") };
    }
    case "note": {
      const deal = await findDeal(intent.deal);
      if (!deal) return { ok: false, text: `Сделка «${intent.deal}» не найдена` };
      await logActivity({ type: "note", title: "Заметка из Telegram", body: intent.text, dealId: deal.id, companyId: deal.companyId, contactId: deal.contactId, userId: user.id });
      return { ok: true, text: `Заметка добавлена к сделке №${deal.number} «${deal.title}»` };
    }
    case "unknown":
      return { ok: false, text: `Не понял команду «${intent.text}».\n\n${BOT_HELP}` };
  }
}

/** Дополняет встроенный разбор (без ключа ИИ): кириллица в \w не входит, суммы без «сум», хвосты в названиях */
function refineIntent(text: string, intent: BotIntent): BotIntent {
  const l = text.toLowerCase();
  if (intent.intent === "unknown") {
    if (/(выстав|отправ|выпиш)[а-яё]*\s+сч[её]т/.test(l)) {
      const m = text.match(/сч[её]т[а-яё]*\s+(?:по\s+)?(?:сделке\s+)?(.+)$/i);
      return { intent: "send_invoice", deal: m?.[1]?.trim() ?? text };
    }
    if (/^(мои задачи|задачи|что у меня)/.test(l)) return { intent: "my_tasks" };
  }
  if (intent.intent === "create_deal" && intent.amount == null) {
    const m = text.match(/\sна\s+(\d[\d\s]{2,})\s*(сум[а-яё]*|uzs|₽|руб[а-яё]*|р|к|тыс[а-яё]*|млн)?\.?\s*$/i);
    if (m) return { ...intent, amount: Number(m[1].replace(/\s/g, "")) * (/^(к|тыс)/i.test(m[2] ?? "") ? 1000 : /^млн/i.test(m[2] ?? "") ? 1_000_000 : 1) };
  }
  if (intent.intent === "create_task" && intent.assignee) {
    const title = intent.title.replace(new RegExp(`^(на|для)\\s+${intent.assignee}\\s+`, "i"), "").trim();
    if (title) return { ...intent, title };
  }
  return intent;
}

/** 20. Выполняет команду сотрудника (из Telegram или консоли) против базы и пишет её в журнал команд */
export async function executeCommand(text: string, user: BotUser, chatId = "web"): Promise<CommandResult> {
  const clean = text.trim();
  if (!clean || /^\/?(help|start|помощь|команды)\b/i.test(clean)) {
    return { ok: true, text: `Здравствуйте, ${user.name.split(" ")[0]}! ${BOT_HELP}`, intent: "unknown", status: "ok", sandbox: true };
  }
  const parsed = await parseBotCommand(clean);
  const intent = parsed.sandbox ? refineIntent(clean, parsed.intent) : parsed.intent;
  const sandbox = parsed.sandbox;
  const actor = await loadActor(user.id);
  if (!actor) return { ok: false, text: "Пользователь не найден", intent: intent.intent, status: "error", sandbox };
  let r: { ok: boolean; text: string };
  try {
    r = await run(intent, user, actor);
  } catch (e) {
    r = { ok: false, text: `Ошибка выполнения: ${e instanceof Error ? e.message : String(e)}` };
  }
  const status: CommandResult["status"] = intent.intent === "unknown" ? "unknown" : r.ok ? "ok" : "error";
  await db.insert(schema.telegramCommands).values({ id: newId("tgc"), chatId, userId: user.id, text: clean, intent: intent.intent, result: r.text, status });
  return { ...r, intent: intent.intent, status, sandbox };
}
