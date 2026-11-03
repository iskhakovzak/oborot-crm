import Anthropic from "@anthropic-ai/sdk";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { resolve, logEvent } from "./registry";

export const DEFAULT_MODEL = "claude-opus-5-5";

async function client(): Promise<{ c: Anthropic | null; model: string }> {
  const r = await resolve("ai");
  const ai = await getSetting("ai");
  if (!r.live || !r.config.apiKey) return { c: null, model: ai.model || DEFAULT_MODEL };
  return { c: new Anthropic({ apiKey: r.config.apiKey }), model: ai.model || DEFAULT_MODEL };
}

async function ask(system: string, user: string, opts?: { json?: boolean; maxTokens?: number }): Promise<{ text: string; sandbox: boolean }> {
  const { c, model } = await client();
  if (!c) return { text: "", sandbox: true };
  try {
    const res = await c.beta.messages.create({
      model,
      max_tokens: opts?.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: opts?.json ? `${system}\n\nОтвечай строго одним JSON-объектом без пояснений и без markdown.` : system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") {
      await logEvent({ kind: "ai.refusal", provider: "anthropic", direction: "out", payload: { category: res.stop_details?.category ?? null }, status: "error" });
      return { text: "", sandbox: false };
    }
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    await logEvent({ kind: "ai.complete", provider: "anthropic", direction: "out", payload: { model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } });
    return { text, sandbox: false };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : String(e);
    await logEvent({ kind: "ai.complete", provider: "anthropic", direction: "out", payload: { error: msg }, status: "error" });
    return { text: "", sandbox: true };
  }
}

function extractJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

async function companyContext() {
  const ai = await getSetting("ai");
  const profile = await getSetting("company");
  return `Ты — ${ai.assistantName}, ИИ-сотрудник компании «${profile.shortName}». Стиль: ${ai.tone}. База знаний: ${ai.knowledge}. Правило передачи менеджеру: ${ai.chatHandoffRule}.`;
}

/** 23. Ответ клиенту в переписке. Возвращает текст и флаг «нужен менеджер». */
export async function draftReply(conversationId: string): Promise<{ text: string; handoff: boolean; sandbox: boolean }> {
  const conv = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, conversationId) });
  if (!conv) return { text: "", handoff: true, sandbox: true };
  const msgs = await db.query.messages.findMany({ where: eq(schema.messages.conversationId, conversationId), orderBy: desc(schema.messages.createdAt), limit: 20 });
  const history = msgs.reverse().map((m) => `${m.direction === "in" ? "Клиент" : "Мы"}: ${m.text}`).join("\n");
  const system = `${await companyContext()}\nОтвечай коротко (2–4 предложения), конкретно, с одним следующим шагом. Если нужен менеджер — укажи handoff=true.`;
  const r = await ask(system, `Переписка с ${conv.peerName} (${conv.channel}):\n${history}\n\nВерни JSON {"reply": string, "handoff": boolean, "reason": string}.`, { json: true, maxTokens: 1500 });
  if (!r.sandbox) {
    const j = extractJson<{ reply: string; handoff: boolean }>(r.text);
    if (j?.reply) return { text: j.reply, handoff: !!j.handoff, sandbox: false };
  }
  const last = msgs[0]?.text.toLowerCase() ?? "";
  const ai = await getSetting("ai");
  const handoff = /менеджер|скидк|дорого|жалоб|договор/.test(last);
  const text = /цен|стоим|сколько/.test(last)
    ? `Здравствуйте! Это ${ai.assistantName}. Стоимость зависит от площади и модели: например, сплит-система на 25 м² с монтажом — от 5 750 000 сум. Подскажите площадь помещения и город, и я подготовлю точный расчёт в течение 10 минут.`
    : /срок|когда|доставк/.test(last)
      ? `Доставка по Ташкенту занимает 1–2 дня, по регионам 3–5 дней, монтаж наши бригады выполняют на следующий день после доставки. Могу зафиксировать удобную дату — какой день вам подходит?`
      : handoff
        ? `Поняла вас. Передаю диалог менеджеру — он свяжется с вами в течение 15 минут в рабочее время.`
        : `Здравствуйте! Это ${ai.assistantName} из компании WS. Подскажите, пожалуйста, какое оборудование вас интересует и для какого помещения — подберу варианты и предложу расчёт.`;
  return { text, handoff, sandbox: true };
}

/** 24. Приём входящего звонка ИИ: диалог по сценарию, итог — краткое резюме и следующий шаг */
export async function handleIncomingCallAi(p: { phone: string; contactName?: string | null; companyName?: string | null }): Promise<{ transcript: string; summary: string; nextStep: string; createLead: boolean; sandbox: boolean }> {
  const ai = await getSetting("ai");
  const system = `${await companyContext()}\nТы принимаешь входящий звонок. Приветствие: «${ai.callGreeting}». Сценарий: ${ai.callScript}`;
  const r = await ask(system, `Звонит ${p.contactName ?? "неизвестный клиент"} ${p.companyName ? `из ${p.companyName}` : ""} с номера ${p.phone}. Смоделируй реалистичный короткий диалог (6–8 реплик) по сценарию и верни JSON {"transcript": string, "summary": string, "nextStep": string, "createLead": boolean}.`, { json: true, maxTokens: 2500 });
  if (!r.sandbox) {
    const j = extractJson<{ transcript: string; summary: string; nextStep: string; createLead: boolean }>(r.text);
    if (j?.transcript) return { ...j, sandbox: false };
  }
  const who = p.contactName ?? "Клиент";
  return {
    transcript: `ИИ: ${ai.callGreeting}\n${who}: Здравствуйте, нужен кондиционер в офис 40 метров, и чтобы с установкой.\nИИ: Подойдёт сплит-система 12 000 BTU, с монтажом от 7 950 000 сум. Монтаж возможен в течение 3 дней. Как к вам обращаться и в какой город доставить?\n${who}: ${who}, Ташкент, Юнусабадский район.\nИИ: Записала. Менеджер пришлёт точный расчёт в Telegram или WhatsApp в течение часа. Куда удобнее?\n${who}: В Telegram.\nИИ: Отлично, отправим в Telegram. Спасибо за звонок!`,
    summary: `Запрос: сплит-система для офиса 40 м² с монтажом, Ташкент (Юнусабад). Клиент ждёт расчёт в Telegram.`,
    nextStep: "Отправить КП с расчётом в Telegram в течение часа",
    createLead: true,
    sandbox: true,
  };
}

export type BotIntent =
  | { intent: "create_deal"; title: string; company?: string; amount?: number }
  | { intent: "create_task"; title: string; assignee?: string; dueInHours?: number }
  | { intent: "create_company"; name: string; inn?: string; phone?: string }
  | { intent: "move_deal"; deal: string; stage: string }
  | { intent: "send_invoice"; deal: string }
  | { intent: "stats"; period: "today" | "week" | "month" }
  | { intent: "my_tasks" }
  | { intent: "find"; query: string }
  | { intent: "note"; deal: string; text: string }
  | { intent: "unknown"; text: string };

/** 20. Разбор команды сотрудника из Telegram в структурированное действие */
export async function parseBotCommand(text: string): Promise<{ intent: BotIntent; sandbox: boolean }> {
  const system = `Ты — парсер команд CRM. Преобразуй фразу сотрудника в JSON одного из видов:
{"intent":"create_deal","title":string,"company"?:string,"amount"?:number}
{"intent":"create_task","title":string,"assignee"?:string,"dueInHours"?:number}
{"intent":"create_company","name":string,"inn"?:string,"phone"?:string}
{"intent":"move_deal","deal":string,"stage":string}
{"intent":"send_invoice","deal":string}
{"intent":"stats","period":"today"|"week"|"month"}
{"intent":"my_tasks"}
{"intent":"find","query":string}
{"intent":"note","deal":string,"text":string}
{"intent":"unknown","text":string}
Суммы — в узбекских сумах (число без валюты; «5 млн» = 5000000, «300 тыс» = 300000). ИНН в Узбекистане — 9 цифр.`;
  const r = await ask(system, text, { json: true, maxTokens: 400 });
  if (!r.sandbox) {
    const j = extractJson<BotIntent>(r.text);
    if (j?.intent) return { intent: j, sandbox: false };
  }
  return { intent: heuristicIntent(text), sandbox: true };
}

export function heuristicIntent(raw: string): BotIntent {
  const t = raw.trim();
  const l = t.toLowerCase();
  const amount = l.match(/(\d[\d\s]{2,})\s*(сум\w*|uzs|₽|руб|р\b|к\b|тыс|млн)/);
  const num = amount ? Number(amount[1].replace(/\s/g, "")) * (/^(к\b|тыс)/.test(amount[2]) ? 1000 : /^млн/.test(amount[2]) ? 1_000_000 : 1) : undefined;
  if (/^(\/?stats|статист|продажи|выручк|сколько продал)/.test(l)) return { intent: "stats", period: /недел/.test(l) ? "week" : /месяц/.test(l) ? "month" : "today" };
  if (/^(\/?tasks|мои задачи|что у меня|задачи на сегодня)/.test(l)) return { intent: "my_tasks" };
  if (/^(найди|найти|покажи|\/find)\s+/.test(l)) return { intent: "find", query: t.replace(/^(найди|найти|покажи|\/find)\s+/i, "") };
  if (/(выстав|отправ)\w*\s+сч[её]т/.test(l)) { const m = t.match(/сч[её]т\w*\s+(?:по\s+)?(?:сделке\s+)?(.+)$/i); return { intent: "send_invoice", deal: m?.[1]?.trim() ?? t }; }
  if (/(перевед|перемест|передвин)/.test(l)) { const m = t.match(/(?:сделку\s+)?(.+?)\s+(?:в|на)\s+(?:этап\s+|стадию\s+)?(.+)$/i); if (m) return { intent: "move_deal", deal: m[1].replace(/^(переведи|перемести|передвинь)\s+/i, ""), stage: m[2] }; }
  if (/(задач|напомни|поставь)/.test(l)) {
    const who = t.match(/\s(?:на|для)\s+([А-ЯЁ][а-яё]+)/)?.[1];
    const hours = /завтра/.test(l) ? 24 : /час/.test(l) ? Number(l.match(/(\d+)\s*час/)?.[1] ?? 1) : /недел/.test(l) ? 24 * 7 : 24;
    const title = t.replace(/^(поставь|создай|добавь)\s+(задачу\s+)?/i, "").replace(/\s(на|для)\s+[А-ЯЁ][а-яё]+/g, "").replace(/\s*(завтра|через \d+ \w+|сегодня)/gi, "").trim();
    return { intent: "create_task", title: title || t, assignee: who, dueInHours: hours };
  }
  if (/(сделк|заказ|лид)/.test(l) && /(созда|добав|нов|заведи)/.test(l)) {
    const company = t.match(/(?:с|для|от|клиент[ау]?)\s+([«"]?[А-ЯЁA-Z][^,]+?[»"]?)(?:\s+на\s|\s*,|$)/)?.[1]?.replace(/[«»"]/g, "");
    const title = t.replace(/^(создай|добавь|заведи|новая|новый)\s+(сделку|заказ|лид)\s*/i, "").replace(/\s+на\s+\d[\d\s]*\s*(сум\w*|uzs|₽|руб\w*|к|тыс\w*|млн)/i, "").trim();
    return { intent: "create_deal", title: title || "Новая сделка", company, amount: num };
  }
  if (/(клиент|компани|контрагент)/.test(l) && /(созда|добав|заведи|нов)/.test(l)) {
    const inn = t.match(/\b(\d{9})\b/)?.[1];
    const name = t.replace(/^(создай|добавь|заведи)\s+(клиента|компанию|контрагента)\s*/i, "").replace(/\s*инн\s*\d+/i, "").trim();
    return { intent: "create_company", name: name || "Новый клиент", inn };
  }
  if (/^(заметка|запиши|коммент)/.test(l)) { const m = t.match(/^(?:заметка|запиши|коммент\w*)\s+(?:к\s+|по\s+)?(?:сделке\s+)?(.+?):\s*(.+)$/i); if (m) return { intent: "note", deal: m[1], text: m[2] }; }
  return { intent: "unknown", text: t };
}

/** 5. Описание и характеристики товара по названию */
export async function describeProduct(name: string, category?: string): Promise<{ description: string; attributes: Record<string, string>; sandbox: boolean }> {
  const r = await ask("Ты — товаровед климатического оборудования. Пиши по-русски, кратко и точно.", `Товар: ${name}${category ? ` (категория: ${category})` : ""}. Верни JSON {"description": string (2 предложения), "attributes": {string: string} (4–6 ключевых характеристик)}.`, { json: true, maxTokens: 800 });
  if (!r.sandbox) { const j = extractJson<{ description: string; attributes: Record<string, string> }>(r.text); if (j?.description) return { ...j, sandbox: false }; }
  return { description: `${name}: надёжное решение для коммерческих помещений. Поставляется с гарантией производителя, монтаж выполняют сертифицированные бригады.`, attributes: { "Гарантия": "3 года", "Срок поставки": "2–7 дней", "Монтаж": "возможен" }, sandbox: true };
}

/** 22. Текстовое резюме для клиентского отчёта */
export async function summarizeForClient(facts: string): Promise<{ text: string; sandbox: boolean }> {
  const r = await ask("Ты пишешь краткое деловое резюме для клиента от лица поставщика. По-русски, 3–4 предложения, без воды.", facts, { maxTokens: 800 });
  if (!r.sandbox && r.text) return { text: r.text, sandbox: false };
  return { text: "", sandbox: true };
}
