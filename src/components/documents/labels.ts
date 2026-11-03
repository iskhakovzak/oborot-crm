import type { DocumentType } from "@/db/schema";
import type { Tone } from "@/components/ui/badge";

export type DocStatus = "draft" | "sent" | "signed" | "paid" | "cancelled";
export type EdoStatus = "none" | "queued" | "sent" | "delivered" | "signed" | "rejected";

export const DOC_TYPE_LABEL: Record<DocumentType, string> = { invoice: "Счёт", contract: "Договор", upd: "ЭСФ", act: "Акт", kp: "КП", report: "Отчёт" };
export const DOC_TYPE_LABEL_FULL: Record<DocumentType, string> = { invoice: "Счёт на оплату", contract: "Договор", upd: "ЭСФ", act: "Акт выполненных работ", kp: "Коммерческое предложение", report: "Отчёт для клиента" };
export const DOC_TYPE_TONE: Record<DocumentType, Tone> = { invoice: "info", contract: "violet", upd: "ink", act: "neutral", kp: "warn", report: "good" };

export const DOC_STATUS_LABEL: Record<DocStatus, string> = { draft: "Черновик", sent: "Отправлен", signed: "Подписан", paid: "Оплачен", cancelled: "Отменён" };
export const DOC_STATUS_TONE: Record<DocStatus, Tone> = { draft: "neutral", sent: "info", signed: "good", paid: "good", cancelled: "accent" };

export const EDO_STATUS_LABEL: Record<EdoStatus, string> = { none: "Не отправлен", queued: "В очереди", sent: "Отправлен", delivered: "Доставлен", signed: "Подписан", rejected: "Отклонён" };
export const EDO_STATUS_TONE: Record<EdoStatus, Tone> = { none: "neutral", queued: "neutral", sent: "info", delivered: "violet", signed: "good", rejected: "accent" };

/** Какие типы можно отправлять в ЭДО */
export const EDO_TYPES: DocumentType[] = ["upd", "act", "contract"];

export const PAYMENT_METHOD_LABEL = { sbp: "Payme/Click", bank: "Банк", cash: "Наличные", card: "Карта" } as const;
export const PAYMENT_METHOD_TONE: Record<keyof typeof PAYMENT_METHOD_LABEL, Tone> = { sbp: "violet", bank: "info", cash: "neutral", card: "warn" };
