import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Реквизиты компании (Узбекистан): ИНН 9 цифр, ОКЭД, регистрационный номер, МФО банка, р/с 20 цифр, НДС 12% */
export type CompanyProfile = {
  name: string; shortName: string; inn: string; oked: string; regNumber: string; address: string; director: string; directorPosition: string;
  accountant: string; bankName: string; mfo: string; account: string; phone: string; email: string; vatPayer: boolean; vatRate: number;
};
export type DistributionSettings = {
  mode: "round_robin" | "least_loaded" | "by_source" | "by_skill";
  managerIds: string[];
  sourceRules: { source: string; managerId: string }[];
  skillRules: { tag: string; managerIds: string[] }[];
  lastIndex: number;
  notifyManager: boolean;
};
export type TelegramBotSettings = { enabled: boolean; webhookSecret: string; allowedUserIds: string[]; ownerChatId: string };
export type AiSettings = {
  model: string; assistantName: string; tone: string; chatAutoReply: boolean; chatHandoffRule: string; callsEnabled: boolean; callGreeting: string;
  callScript: string; knowledge: string; maxAutoReplies: number;
};
export type BookingSettings = { confirmByChannel: "telegram" | "whatsapp" | "email" | "sms"; createLead: boolean; defaultPipelineId: string | null };

const DEFAULTS: { company: CompanyProfile; distribution: DistributionSettings; telegram: TelegramBotSettings; ai: AiSettings; booking: BookingSettings } = {
  company: {
    name: "ООО «WS Climate»", shortName: "WS", inn: "305123456", oked: "43220", regNumber: "1234567",
    address: "100015, г. Ташкент, Мирабадский район, ул. Шахрисабз, 16", director: "Каримов Алишер Бахтиёрович", directorPosition: "Директор",
    accountant: "Рашидова Дилноза Фарходовна", bankName: "АКБ «Капиталбанк»", mfo: "00974", account: "20208000900123456001",
    phone: "+998 71 200-00-00", email: "hello@ws-crm.uz", vatPayer: true, vatRate: 12,
  },
  distribution: { mode: "round_robin", managerIds: [], sourceRules: [], skillRules: [], lastIndex: 0, notifyManager: true },
  telegram: { enabled: true, webhookSecret: "", allowedUserIds: [], ownerChatId: "" },
  ai: {
    model: "claude-opus-5-5", assistantName: "Малика", tone: "дружелюбно и по делу, на «вы»",
    chatAutoReply: true, chatHandoffRule: "если клиент просит менеджера, спорит о цене или задаёт вопрос вне базы знаний — передать менеджеру",
    callsEnabled: true, callGreeting: "Здравствуйте! Компания WS, меня зовут Малика. Чем могу помочь?",
    callScript: "Выясни, что нужно клиенту, уточни имя и компанию, предложи записаться на консультацию или оформить заявку. Если вопрос срочный — переведи на менеджера.",
    knowledge: "Мы продаём и устанавливаем климатическое оборудование для бизнеса в Ташкенте и по всему Узбекистану: кондиционеры, вентиляцию, тепловые завесы. Доставка по Ташкенту 1–2 дня, по регионам 3–5 дней, монтаж своими бригадами, гарантия 3 года. Работаем по договору, оплата по счёту (перечислением) или через Payme/Click, цены в сумах с НДС 12%. Выставляем ЭСФ через Didox.",
    maxAutoReplies: 5,
  },
  booking: { confirmByChannel: "telegram", createLead: true, defaultPipelineId: null },
};
export type SettingsKey = keyof typeof DEFAULTS;
export type SettingsValue<K extends SettingsKey> = (typeof DEFAULTS)[K];

export async function getSetting<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return { ...DEFAULTS[key], ...((row?.value as object) ?? {}) } as SettingsValue<K>;
}
export async function setSetting<K extends SettingsKey>(key: K, value: Partial<SettingsValue<K>>) {
  const current = await getSetting(key);
  const next = { ...current, ...value };
  await db.insert(schema.settings).values({ key, value: next, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: schema.settings.key, set: { value: next, updatedAt: new Date().toISOString() } });
  return next;
}
export function appUrl(path = "") {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}
