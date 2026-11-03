/** Клиентские константы рассылок (без импорта БД) */
export type CampaignChannel = "email" | "telegram" | "whatsapp" | "max" | "instagram" | "sms";
export type Segment = { status?: string[]; tags?: string[]; managerIds?: string[]; source?: string[] };
export const CHANNEL_LABEL: Record<CampaignChannel, string> = { email: "Email", telegram: "Telegram", whatsapp: "WhatsApp", max: "MAX", instagram: "Instagram", sms: "SMS" };
export const COMPANY_STATUS_LABEL: Record<string, string> = { lead: "Лид", client: "Клиент", partner: "Партнёр", archived: "Архив" };
