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

/** Каталог провайдеров (Узбекистан). Без ключей любой провайдер работает в демо-режиме (sandbox) — все действия логируются и видны в журнале интеграций. */
export const CATALOG: ProviderDef[] = [
  // 1. Мессенджеры — Telegram главный канал в Узбекистане
  { kind: "messenger", provider: "telegram", name: "Telegram", description: "Главный канал общения с клиентами в Узбекистане. Переписка через Bot API: входящие попадают в «Переписки», ответы уходят из CRM.", fields: [{ key: "botToken", label: "Токен бота", secret: true, placeholder: "123456:ABC…" }] },
  { kind: "messenger", provider: "whatsapp", name: "WhatsApp (Green API)", description: "Официальный шлюз WhatsApp через Green API: отправка и приём сообщений.", fields: [{ key: "instanceId", label: "ID инстанса" }, { key: "apiToken", label: "API-токен", secret: true }] },
  { kind: "messenger", provider: "instagram", name: "Instagram Direct", description: "Сообщения бизнес-аккаунта Instagram через Meta Graph API: заявки из Direct попадают в «Переписки».", fields: [{ key: "pageToken", label: "Page access token", secret: true }, { key: "igAccountId", label: "ID бизнес-аккаунта Instagram" }] },
  { kind: "messenger", provider: "max", name: "MAX", description: "Мессенджер MAX: бот для общения с клиентами.", fields: [{ key: "botToken", label: "Токен бота", secret: true }] },
  // 2. Телефония
  { kind: "telephony", provider: "onlinepbx", name: "OnlinePBX", description: "Виртуальная АТС OnlinePBX: исходящие звонки из карточки, входящие с записью разговора и ИИ-приёмом.", fields: [{ key: "domain", label: "Домен АТС", placeholder: "company.onpbx.ru" }, { key: "apiKey", label: "API-ключ", secret: true }, { key: "fromExtension", label: "Внутренний номер по умолчанию" }] },
  { kind: "telephony", provider: "zadarma", name: "Zadarma", description: "Виртуальная АТС Zadarma с узбекскими номерами: callback-звонки и вебхуки входящих.", fields: [{ key: "userKey", label: "Ключ", secret: true }, { key: "secretKey", label: "Секрет", secret: true }] },
  { kind: "telephony", provider: "sipuni", name: "Sipuni", description: "Телефония Sipuni: звонки из CRM и запись разговоров.", fields: [{ key: "user", label: "Пользователь" }, { key: "secret", label: "Секрет", secret: true }] },
  // 3. Почта
  { kind: "email", provider: "smtp", name: "Почта (SMTP/IMAP)", description: "Отправка писем, счетов и рассылок с вашего домена; входящие письма попадают в переписки.", fields: [{ key: "host", label: "SMTP-хост", placeholder: "smtp.gmail.com" }, { key: "port", label: "Порт", placeholder: "465" }, { key: "user", label: "Логин" }, { key: "pass", label: "Пароль", secret: true }, { key: "from", label: "От кого", placeholder: "WS <sales@ws-crm.uz>" }, { key: "imapHost", label: "IMAP-хост (входящие)", placeholder: "imap.gmail.com" }] },
  // 4-5. Данные
  { kind: "company_data", provider: "soliq", name: "Реестр ЮЛ (soliq.uz)", description: "Автозаполнение карточки клиента по ИНН (9 цифр): название, адрес, руководитель, ОКЭД, банк по МФО. Публичного API у реестра нет — используется встроенный справочник и генератор.", fields: [{ key: "token", label: "API-ключ (если есть доступ)", secret: true, hint: "Без ключа используется встроенный демонстрационный справочник" }] },
  { kind: "product_data", provider: "barcode", name: "База штрихкодов", description: "Автозаполнение товара по штрихкоду или артикулу: название, бренд, категория, вес.", fields: [{ key: "apiKey", label: "API-ключ", secret: true, hint: "Без ключа используется встроенная база и ИИ-описание" }] },
  // 9. ЭДО
  { kind: "edo", provider: "didox", name: "Didox", description: "Оператор ЭДО didox.uz: автоотправка ЭСФ и актов контрагенту, статусы подписания в карточке.", fields: [{ key: "token", label: "API-токен", secret: true, placeholder: "didox_…" }] },
  { kind: "edo", provider: "faktura", name: "Faktura.uz", description: "Электронный документооборот Faktura.uz: ЭСФ, акты, договоры.", fields: [{ key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }] },
  // 10-11. Платёжные ссылки и банк
  { kind: "sbp", provider: "payme", name: "Payme Business", description: "Ссылки и QR на оплату через Payme (checkout.paycom.uz), уведомления об оплате.", fields: [{ key: "merchantId", label: "Merchant ID" }, { key: "key", label: "Ключ мерчанта", secret: true }] },
  { kind: "sbp", provider: "click", name: "Click", description: "Платёжные ссылки Click (my.click.uz): service_id, merchant_id и секретный ключ из кабинета мерчанта.", fields: [{ key: "serviceId", label: "Service ID" }, { key: "merchantId", label: "Merchant ID" }, { key: "secret", label: "Секретный ключ", secret: true }] },
  { kind: "sbp", provider: "uzum", name: "Uzum Bank: оплата", description: "Платёжные ссылки Uzum Bank (Uzum Nasiya / карты) через API.", fields: [{ key: "apiKey", label: "API-ключ", secret: true }] },
  { kind: "bank", provider: "kapitalbank", name: "Капиталбанк: выписка", description: "Загрузка выписки по р/с в Капиталбанке и автоматическая разноска платежей по счетам и клиентам.", fields: [{ key: "token", label: "Токен", secret: true }, { key: "accountNumber", label: "Номер счёта (20 цифр)" }] },
  { kind: "bank", provider: "hamkorbank", name: "Hamkorbank: выписка", description: "Выписка по расчётному счёту Hamkorbank через API для бизнеса.", fields: [{ key: "token", label: "Токен", secret: true }, { key: "accountNumber", label: "Номер счёта (20 цифр)" }] },
  { kind: "bank", provider: "uzum", name: "Uzum Bank: выписка", description: "Выписка по счёту в Uzum Bank.", fields: [{ key: "token", label: "Токен", secret: true }, { key: "accountNumber", label: "Номер счёта (20 цифр)" }] },
  { kind: "bank", provider: "tbc", name: "TBC Bank: выписка", description: "Выписка по счёту в TBC Bank Uzbekistan.", fields: [{ key: "token", label: "Токен", secret: true }, { key: "accountNumber", label: "Номер счёта (20 цифр)" }] },
  // 12. Финучёт
  { kind: "finance", provider: "onec", name: "1С:Бухгалтерия для Узбекистана", description: "Двусторонняя синхронизация контрагентов, счетов и оплат с 1С:Бухгалтерия 8 для Узбекистана через OData.", fields: [{ key: "url", label: "Адрес OData", placeholder: "https://1c.company.uz/base/odata/standard.odata" }, { key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }] },
  { kind: "finance", provider: "smartup", name: "SmartUp", description: "Передача оплат, счетов и контрагентов в SmartUp ERP.", fields: [{ key: "apiToken", label: "API-токен", secret: true }, { key: "projectCode", label: "Код проекта" }] },
  { kind: "finance", provider: "hisobchi", name: "Hisobchi", description: "Синхронизация с онлайн-бухгалтерией Hisobchi.", fields: [{ key: "apiKey", label: "API-ключ", secret: true }] },
  // 16-17. SMS
  { kind: "sms", provider: "eskiz", name: "Eskiz.uz", description: "SMS-шлюз Eskiz: подтверждения, напоминания и ссылки на оплату клиентам по всему Узбекистану.", fields: [{ key: "email", label: "Email аккаунта" }, { key: "password", label: "Пароль", secret: true }, { key: "from", label: "Имя отправителя", placeholder: "4546", hint: "По умолчанию 4546" }] },
  { kind: "sms", provider: "playmobile", name: "Playmobile", description: "SMS-шлюз Playmobile (send.smsxabar.uz).", fields: [{ key: "login", label: "Логин" }, { key: "password", label: "Пароль", secret: true }, { key: "originator", label: "Имя отправителя", placeholder: "3700", hint: "По умолчанию 3700" }] },
  // 27. Аналитика
  { kind: "analytics", provider: "yandex_metrika", name: "Яндекс Метрика", description: "Передача лидов и продаж как офлайн-конверсий по ClientID — сквозная аналитика Яндекс Директа.", fields: [{ key: "counterId", label: "Номер счётчика" }, { key: "oauthToken", label: "OAuth-токен", secret: true }, { key: "goalLead", label: "Цель «лид»", placeholder: "crm_lead" }, { key: "goalSale", label: "Цель «продажа»", placeholder: "crm_sale" }] },
  { kind: "analytics", provider: "ga4", name: "Google Analytics 4", description: "Передача лидов и продаж в GA4 через Measurement Protocol — сквозная аналитика Google Ads и Instagram.", fields: [{ key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXX" }, { key: "apiSecret", label: "API secret", secret: true }, { key: "goalLead", label: "Событие «лид»", placeholder: "generate_lead" }, { key: "goalSale", label: "Событие «продажа»", placeholder: "purchase" }] },
  { kind: "analytics", provider: "roistat", name: "Roistat", description: "Передача сделок и статусов в Roistat.", fields: [{ key: "projectId", label: "ID проекта" }, { key: "apiKey", label: "API-ключ", secret: true }] },
  // 23-24. ИИ
  { kind: "ai", provider: "anthropic", name: "Claude (Anthropic)", description: "ИИ-ответы клиентам, приём входящих звонков, разбор команд Telegram-бота, описания товаров.", fields: [{ key: "apiKey", label: "API-ключ", secret: true, hint: "Можно задать переменной ANTHROPIC_API_KEY" }] },
  // 20. Telegram-бот команды
  { kind: "telegram_bot", provider: "telegram", name: "Telegram-бот для сотрудников", description: "Любые действия в CRM командой из Telegram: «создай сделку», «поставь задачу Жасуру», «покажи продажи за неделю».", fields: [{ key: "botToken", label: "Токен бота", secret: true, hint: "Можно задать переменной TELEGRAM_BOT_TOKEN" }] },
];

export type Resolved = { provider: string; name: string; config: Record<string, string>; live: boolean; integrationId: string | null };

const ENV_FALLBACK: Partial<Record<IntegrationKind, () => Record<string, string> | null>> = {
  ai: () => (process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : null),
  telegram_bot: () => (process.env.TELEGRAM_BOT_TOKEN ? { botToken: process.env.TELEGRAM_BOT_TOKEN } : null),
  company_data: () => (process.env.SOLIQ_TOKEN ? { token: process.env.SOLIQ_TOKEN } : null),
  sms: () => (process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD ? { email: process.env.ESKIZ_EMAIL, password: process.env.ESKIZ_PASSWORD, from: process.env.ESKIZ_FROM ?? "" } : null),
  sbp: () => (process.env.PAYME_MERCHANT_ID && process.env.PAYME_KEY ? { merchantId: process.env.PAYME_MERCHANT_ID, key: process.env.PAYME_KEY } : null),
  edo: () => (process.env.DIDOX_TOKEN ? { token: process.env.DIDOX_TOKEN } : null),
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
