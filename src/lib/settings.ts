import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type CompanyProfile = {
  name: string; shortName: string; inn: string; kpp: string; ogrn: string; address: string; director: string; directorPosition: string;
  accountant: string; bankName: string; bik: string; account: string; corrAccount: string; phone: string; email: string; vatPayer: boolean; vatRate: number;
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
    name: "ООО «Оборот»", shortName: "Оборот", inn: "7707083893", kpp: "770701001", ogrn: "1027700132195",
    address: "123112, г. Москва, Пресненская наб., д. 12, этаж 14", director: "Костин Станислав Игоревич", directorPosition: "Генеральный директор",
    accountant: "Белова Анна Сергеевна", bankName: "АО «ТБанк»", bik: "044525974", account: "40702810110000123456", corrAccount: "30101810145250000974",
    phone: "+7 495 120-00-00", email: "hello@oborot.ru", vatPayer: true, vatRate: 20,
  },
  distribution: { mode: "round_robin", managerIds: [], sourceRules: [], skillRules: [], lastIndex: 0, notifyManager: true },
  telegram: { enabled: true, webhookSecret: "", allowedUserIds: [], ownerChatId: "" },
  ai: {
    model: "claude-opus-5-5", assistantName: "Мария", tone: "дружелюбно и по делу, на «вы»",
    chatAutoReply: true, chatHandoffRule: "если клиент просит менеджера, спорит о цене или задаёт вопрос вне базы знаний — передать менеджеру",
    callsEnabled: true, callGreeting: "Здравствуйте! Компания Оборот, меня зовут Мария. Чем могу помочь?",
    callScript: "Выясни, что нужно клиенту, уточни имя и компанию, предложи записаться на консультацию или оформить заявку. Если вопрос срочный — переведи на менеджера.",
    knowledge: "Мы продаём и устанавливаем климатическое оборудование для бизнеса: кондиционеры, вентиляцию, тепловые завесы. Доставка по России 2–7 дней, монтаж своими бригадами, гарантия 3 года. Работаем по договору, оплата по счёту или по СБП, с НДС.",
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
