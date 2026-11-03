import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { COMPANY_STATUS_LABEL, type Segment } from "@/lib/campaigns";
import type { Tone } from "@/components/ui/badge";
import type { CampaignOptions } from "./campaign-form";
import { TEMPLATE_VARS } from "@/lib/automations/templates";

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Черновик", tone: "neutral" },
  scheduled: { label: "Запланирована", tone: "warn" },
  sending: { label: "Отправляется", tone: "info" },
  sent: { label: "Отправлена", tone: "good" },
};
export const CHANNEL_TONE: Record<string, Tone> = { email: "info", telegram: "info", whatsapp: "good", max: "violet", instagram: "accent", sms: "warn" };

export function segmentSummary(s: Segment, managers: Map<string, string>) {
  const parts: string[] = [];
  if (s.status?.length) parts.push(s.status.map((x) => COMPANY_STATUS_LABEL[x] ?? x).join(", "));
  if (s.tags?.length) parts.push(`теги: ${s.tags.join(", ")}`);
  if (s.managerIds?.length) parts.push(s.managerIds.map((id) => managers.get(id) ?? "—").join(", "));
  if (s.source?.length) parts.push(`источник: ${s.source.join(", ")}`);
  return parts.length ? parts.join(" · ") : "Все клиенты";
}

/** Варианты для фильтров сегмента: теги и источники из карточек клиентов, активные сотрудники */
export async function campaignOptions(): Promise<CampaignOptions> {
  const companies = await db.select({ tags: schema.companies.tags, source: schema.companies.source }).from(schema.companies);
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.isActive, true));
  const tags = [...new Set(companies.flatMap((c) => c.tags ?? []))].sort((a, b) => a.localeCompare(b, "ru"));
  const sources = [...new Set(companies.map((c) => c.source).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "ru"));
  return { tags, sources, managers: users, templateVars: TEMPLATE_VARS };
}
