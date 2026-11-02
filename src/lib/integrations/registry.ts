import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { IntegrationKind } from "@/db/schema";
import { newId } from "@/lib/utils";

export type ProviderDef = {
  kind: IntegrationKind;
  provider: string;
  name: string;
  description: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string; hint?: string }[];
  docsUrl?: string;
};

/** Каталог провайдеров. Без ключей любой провайдер работает в демо-режиме (sandbox) — все действия логируются и видны в журнале интеграций. */
export const CATALOG: ProviderDef[] = [
  // 1. Мессенджеры
  { kind: "messenger", provider: "telegram", name: "Telegram", description: "Переписка с клиентами через Bot API: входящие попадают в «Переписки», ответы уходят из CRM.", fields: [{ key: "botToken", label: "Токен бота", secret: true, placeholder: "123456:ABC…" }] },
  { kind: "messenger", provider: "whatsapp", name: "WhatsApp (Green API)", description: "Официальный шлюз WhatsApp через Green API: отправка и приём сообщений.", fields: [{ key: "instanceId", label: "ID инстанса" }, { key: "apiToken", label: "API-токен", secret: true }] },
  { kind: "messenger", provider: "vk", name: "ВКонтакте", description: "Сообщения сообщества ВКонтакте.", fields: [{ key: "groupToken", label: "Ключ доступа сообщества", secret: true }, { key: "groupId", label: "ID сообщества" }] },
  { kind: "messenger", provider: "max", name: "MAX", description: "Мессенджер MAX (VK): бот для общения с клиентами.", fields: [{ key: "botToken", label: "Токен бота", secret: true }] },
  // 2. Телефония
  { kind: "telephony", provider: "mango", name: "Mango Office", description: "Исходящие звонки из карточки, входящие с записью разговора и ИИ-приёмом.", fields: [{ key: "apiKey", label: "Уникальный код", secret: true }, { key: "apiSalt", label: "Ключ для создания подписи", secret: true }, { key: "fromExtension", label: "Внутренний номер по умолчанию" }] },
  { kind: "telephony", provider: "zadarma", name: "Zadarma", description: "Виртуальная АТС Zadarma: callback-звонки и вебхуки входящих.", fields: [{ key: "userKey", label: "Ключ", secret: true }, { key: "secretKey", label: "Секрет", secret: true }] },
  { kind: "telephony", provider: "uis", name: "UIS / CoMagic", description: "Телефония и коллтрекинг UIS.", fields: [{ key: "accessToken", label: "Access token", secret: true }] },
  // 3. Почта
  { kind: "email", provider: "smtp", name: "Почта (SMTP/IMAP)", description: "Отправка писем, счетов и рассылок с вашего домена; входящие письма попадают в переписки.", fields: [{ key: "host", label: "SMTP-хост", placeholder: "smtp.yandex.ru" }, { key: "port", label: "Порт", placeholder: "465" }, { key: "user", label: "Логин" }, { key: "pass", label: "Пароль", secret: true }, { key: "from", label: "От кого", placeholder: "Оборот <sales@oborot.ru>" }, { key: "imapHost", label: "IMAP-хост (входящие)", placeholder: "imap.yandex.ru" }] },
  // 4-5. Данные
  { kind: "company_data", provider: "dadata", name: "DaData (ЕГРЮЛ/ЕГРИП)", description: "Автозаполнение карточки клиента по ИНН: название, адрес, руководитель, ОГРН, банк по БИК.", fields: [{ key: "token", label: "API-ключ", secret: true }] },
  { kind: "product_data", provider: "barcode", name: "База штрихкодов", description: "Автозаполнение товара по штрихкоду или артикулу: название, бренд, категория, вес.", fields: [{ key: "apiKey", label: "API-ключ", secret: true, hint: "Без ключа используется встроенная база и ИИ-описание" }] },
  // 9. ЭДО
  { kind: "edo", provider: "diadoc", name: "Контур.Диадок", description: "Автоотправка УПД и актов контрагенту в ЭДО, статусы подписания в карточке.", fields: [{ key: "apiClientId", label: "API Client ID", secret: true }, { key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }, { key: "boxId", label: "ID ящика" }] },
  { kind: "edo", provider: "sbis", name: "СБИС", description: "Электронный документооборот СБИС.", fields: [{ key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }] },
  // 10-11. Платежи и банк
  { kind: "sbp", provider: "tbank", name: "Т-Банк: СБП", description: "Ссылки и QR на оплату по СБП, уведомления об оплате.", fields: [{ key: "terminalKey", label: "Terminal key" }, { key: "password", label: "Пароль терминала", secret: true }] },
  { kind: "sbp", provider: "tochka", name: "Точка: СБП", description: "Платёжные ссылки и QR СБП через API Точки.", fields: [{ key: "token", label: "JWT-токен", secret: true }, { key: "merchantId", label: "ID мерчанта" }] },
  { kind: "bank", provider: "tochka", name: "Точка: выписка", description: "Загрузка выписки и автоматическая разноска платежей по счетам и клиентам.", fields: [{ key: "token", label: "JWT-токен", secret: true }, { key: "accountId", label: "Счёт" }] },
  { kind: "bank", provider: "tbank", name: "Т-Банк: выписка", description: "Выписка по расчётному счёту через Open API.", fields: [{ key: "token", label: "Токен", secret: true }, { key: "accountNumber", label: "Номер счёта" }] },
  { kind: "bank", provider: "modulbank", name: "Модульбанк", description: "Выписка Модульбанка.", fields: [{ key: "token", label: "Токен", secret: true }] },
  // 12. Финучёт
  { kind: "finance", provider: "onec", name: "1С:Бухгалтерия", description: "Двусторонняя синхронизация контрагентов, счетов и оплат с 1С через OData.", fields: [{ key: "url", label: "Адрес OData", placeholder: "https://1c.company.ru/base/odata/standard.odata" }, { key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }] },
  { kind: "finance", provider: "finolog", name: "Финолог", description: "Передача оплат и счетов в управленческий учёт Финолог.", fields: [{ key: "apiToken", label: "API-токен", secret: true }, { key: "bizId", label: "ID бизнеса" }] },
  { kind: "finance", provider: "planfact", name: "ПланФакт", description: "Синхронизация с ПланФакт.", fields: [{ key: "apiKey", label: "API-ключ", secret: true }] },
  { kind: "finance", provider: "moysklad", name: "МойСклад", description: "Товары, остатки и отгрузки из МоегоСклада.", fields: [{ key: "token", label: "Токен", secret: true }] },
  // 16-17. SMS
  { kind: "sms", provider: "smsru", name: "SMS.ru", description: "Отправка SMS клиентам: подтверждения, напоминания, ссылки на оплату.", fields: [{ key: "apiId", label: "api_id", secret: true }, { key: "from", label: "Имя отправителя" }] },
  { kind: "sms", provider: "smsc", name: "SMSC.ru", description: "SMS-шлюз SMSC.", fields: [{ key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }] },
  // 27. Аналитика
  { kind: "analytics", provider: "yandex_metrika", name: "Яндекс Метрика", description: "Передача лидов и продаж как офлайн-конверсий по ClientID — сквозная аналитика рекламы.", fields: [{ key: "counterId", label: "Номер счётчика" }, { key: "oauthToken", label: "OAuth-токен", secret: true }, { key: "goalLead", label: "Цель «лид»", placeholder: "crm_lead" }, { key: "goalSale", label: "Цель «продажа»", placeholder: "crm_sale" }] },
  { kind: "analytics", provider: "roistat", name: "Roistat", description: "Передача сделок и статусов в Roistat.", fields: [{ key: "projectId", label: "ID проекта" }, { key: "apiKey", label: "API-ключ", secret: true }] },
  { kind: "analytics", provider: "calltouch", name: "Calltouch", description: "Сделки и звонки в Calltouch.", fields: [{ key: "siteId", label: "Site ID" }, { key: "token", label: "Токен", secret: true }] },
  // 23-24. ИИ
  { kind: "ai", provider: "anthropic", name: "Claude (Anthropic)", description: "ИИ-ответы клиентам, приём входящих звонков, разбор команд Telegram-бота, описания товаров.", fields: [{ key: "apiKey", label: "API-ключ", secret: true, hint: "Можно задать переменной ANTHROPIC_API_KEY" }] },
  // 20. Telegram-бот команды
  { kind: "telegram_bot", provider: "telegram", name: "Telegram-бот для сотрудников", description: "Любые действия в CRM командой из Telegram: «создай сделку», «поставь задачу Ивану», «покажи продажи за неделю».", fields: [{ key: "botToken", label: "Токен бота", secret: true, hint: "Можно задать переменной TELEGRAM_BOT_TOKEN" }] },
];

export type Resolved = { provider: string; name: string; config: Record<string, string>; live: boolean; integrationId: string | null };

const ENV_FALLBACK: Partial<Record<IntegrationKind, () => Record<string, string> | null>> = {
  ai: () => (process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : null),
  telegram_bot: () => (process.env.TELEGRAM_BOT_TOKEN ? { botToken: process.env.TELEGRAM_BOT_TOKEN } : null),
  company_data: () => (process.env.DADATA_TOKEN ? { token: process.env.DADATA_TOKEN } : null),
  email: () => (process.env.SMTP_HOST ? { host: process.env.SMTP_HOST, port: process.env.SMTP_PORT ?? "465", user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "", from: process.env.SMTP_FROM ?? "" } : null),
};

/** Возвращает активную интеграцию данного типа (или конкретного провайдера). live=false означает демо-режим. */
export async function resolve(kind: IntegrationKind, provider?: string): Promise<Resolved> {
  const rows = await db.select().from(schema.integrations).where(provider ? and(eq(schema.integrations.kind, kind), eq(schema.integrations.provider, provider)) : eq(schema.integrations.kind, kind));
  const enabled = rows.find((r) => r.isEnabled) ?? rows[0];
  const def = CATALOG.find((c) => c.kind === kind && (!enabled || c.provider === enabled.provider)) ?? CATALOG.find((c) => c.kind === kind)!;
  const env = ENV_FALLBACK[kind]?.() ?? null;
  const cfg = { ...(env ?? {}), ...(enabled?.config ?? {}) };
  const required = def.fields.filter((f) => !f.hint).map((f) => f.key);
  const live = !!enabled?.isEnabled && (required.every((k) => cfg[k]) || (!!env && Object.keys(env).every((k) => cfg[k])));
  return { provider: def.provider, name: def.name, config: cfg, live: live || (!!env && (!enabled || enabled.isEnabled)), integrationId: enabled?.id ?? null };
}

export async function logEvent(e: { kind: string; provider: string; direction: "in" | "out"; payload?: Record<string, unknown>; status?: "ok" | "error" | "sandbox"; integrationId?: string | null }) {
  await db.insert(schema.integrationEvents).values({ id: newId("iev"), integrationId: e.integrationId ?? null, provider: e.provider, direction: e.direction, kind: e.kind, payload: e.payload ?? null, status: e.status ?? "ok" });
}
