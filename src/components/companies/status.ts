import type { Tone } from "@/components/ui/badge";

export const COMPANY_STATUS: Record<string, [string, Tone]> = { lead: ["Лид", "warn"], client: ["Клиент", "good"], partner: ["Партнёр", "violet"], archived: ["Архив", "neutral"] };
