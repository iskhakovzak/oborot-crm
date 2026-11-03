import type { IntegrationKind } from "@/db/schema";

export type ProviderCard = {
  kind: IntegrationKind;
  provider: string;
  name: string;
  description: string;
  fields: { key: string; label: string; secret?: boolean; placeholder?: string; hint?: string }[];
  isEnabled: boolean;
  live: boolean;
  /** значения несекретных полей; секретные приходят пустыми, но помечены в filled */
  config: Record<string, string>;
  filled: string[];
  lastSyncLabel: string | null;
  lastError: string | null;
};

export const KIND_TITLES: Record<IntegrationKind, string> = {
  messenger: "Мессенджеры",
  telephony: "Телефония",
  email: "Почта",
  company_data: "Данные о компаниях и товарах",
  product_data: "Данные о компаниях и товарах",
  edo: "ЭДО",
  sbp: "Платежи Payme / Click",
  bank: "Банк",
  finance: "Финучёт",
  sms: "SMS",
  analytics: "Аналитика",
  ai: "ИИ",
  telegram_bot: "Telegram-бот",
};

export const KIND_ORDER: IntegrationKind[] = ["messenger", "telephony", "email", "company_data", "product_data", "edo", "sbp", "bank", "finance", "sms", "analytics", "ai", "telegram_bot"];

export const KIND_HINTS: Partial<Record<IntegrationKind, string>> = {
  messenger: "Входящие попадают в «Переписки», ответы и автоматизации уходят клиенту в его канал",
  telephony: "Звонок из карточки, запись разговора, ИИ принимает входящие",
  email: "Счета, договоры и рассылки с вашего домена",
  company_data: "Карточка клиента по ИНН, товар по штрихкоду",
  edo: "ЭСФ и акты уходят контрагенту на подпись автоматически",
  sbp: "Ссылка и QR на оплату в чате с клиентом",
  bank: "Выписка загружается и разносится по счетам сама",
  finance: "Оплаты и счета синхронизируются с бухгалтерией",
  sms: "Подтверждения, напоминания, ссылки на оплату",
  analytics: "Лиды и продажи уходят в рекламные кабинеты как офлайн-конверсии",
  ai: "Ответы клиентам, приём звонков, команды бота, описания товаров",
  telegram_bot: "Сотрудники управляют CRM командами из Telegram",
};

export function cardStatus(c: ProviderCard): { label: string; tone: "good" | "warn" | "neutral" } {
  if (!c.isEnabled) return { label: "Выключено", tone: "neutral" };
  if (c.live) return { label: "Подключено", tone: "good" };
  return { label: "Демо-режим", tone: "warn" };
}
