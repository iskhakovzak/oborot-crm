"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { audit } from "@/lib/activity";
import { previewSegment, sendCampaign } from "@/lib/campaigns";
import type { CampaignChannel, Segment } from "@/components/campaigns/constants";

const CHANNELS: CampaignChannel[] = ["email", "telegram", "whatsapp", "max", "instagram", "sms"];

export type CampaignInput = { id?: string; name: string; channel: CampaignChannel; subject?: string; body: string; segment: Segment };

function cleanSegment(s: Segment): Segment {
  const arr = (xs?: string[]) => (xs ?? []).map((x) => String(x).trim()).filter(Boolean);
  const out: Segment = {};
  if (arr(s.status).length) out.status = arr(s.status);
  if (arr(s.tags).length) out.tags = arr(s.tags);
  if (arr(s.managerIds).length) out.managerIds = arr(s.managerIds);
  if (arr(s.source).length) out.source = arr(s.source);
  return out;
}

/** Сохранить черновик или сразу отправить */
export async function saveCampaign(input: CampaignInput, send: boolean): Promise<{ ok: true; id: string; sandbox?: boolean; sent?: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user.actor, "campaigns", input.id ? "edit" : "create")) return { ok: false, error: "Нет прав на создание рассылок" };
  const name = input.name.trim(), body = input.body.trim();
  if (!name) return { ok: false, error: "Укажите название рассылки" };
  if (!body) return { ok: false, error: "Введите текст рассылки" };
  if (!CHANNELS.includes(input.channel)) return { ok: false, error: "Неизвестный канал" };
  if (input.channel === "email" && !input.subject?.trim()) return { ok: false, error: "Для email нужна тема письма" };
  const segment = cleanSegment(input.segment);
  const id = input.id ?? newId("cmp");
  if (input.id) {
    const existing = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, input.id) });
    if (!existing) return { ok: false, error: "Рассылка не найдена" };
    if (existing.status !== "draft") return { ok: false, error: "Отправленную рассылку нельзя изменить — создайте копию" };
    await db.update(schema.campaigns).set({ name, channel: input.channel, subject: input.subject?.trim() || null, body, segment }).where(eq(schema.campaigns.id, id));
    await audit(user.id, "campaigns", id, "update", { name });
  } else {
    await db.insert(schema.campaigns).values({ id, name, channel: input.channel, subject: input.subject?.trim() || null, body, segment, status: "draft", createdBy: user.id });
    await audit(user.id, "campaigns", id, "create", { name });
  }
  let sandbox: boolean | undefined, sent: number | undefined;
  if (send) {
    try {
      const r = await sendCampaign(id, user.id);
      sandbox = r.sandbox; sent = r.stats.sent;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true, id, sandbox, sent };
}

export async function previewSegmentAction(segment: Segment, channel: CampaignChannel) {
  const user = await requireUser();
  if (!can(user.actor, "campaigns", "view")) return { count: 0, names: [] as string[] };
  return previewSegment(cleanSegment(segment), channel);
}

export async function sendCampaignAction(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!can(user.actor, "campaigns", "edit")) return { ok: false, message: "Нет прав на отправку рассылок" };
  try {
    const r = await sendCampaign(id, user.id);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${id}`);
    return { ok: true, message: `Отправлено ${r.stats.sent} из ${r.stats.total}${r.sandbox ? " (демо-режим: провайдер не подключён)" : ""}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Копия рассылки как новый черновик */
export async function duplicateCampaign(id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user.actor, "campaigns", "create")) return { ok: false, error: "Нет прав на создание рассылок" };
  const c = await db.query.campaigns.findFirst({ where: eq(schema.campaigns.id, id) });
  if (!c) return { ok: false, error: "Рассылка не найдена" };
  const newIdValue = newId("cmp");
  await db.insert(schema.campaigns).values({ id: newIdValue, name: `${c.name} (копия)`, channel: c.channel, subject: c.subject, body: c.body, segment: c.segment, status: "draft", createdBy: user.id });
  await audit(user.id, "campaigns", newIdValue, "create", { from: id });
  revalidatePath("/campaigns");
  return { ok: true, id: newIdValue };
}

export async function deleteCampaign(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!can(user.actor, "campaigns", "delete")) return { ok: false, error: "Нет прав на удаление" };
  await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
  await audit(user.id, "campaigns", id, "delete");
  revalidatePath("/campaigns");
  return { ok: true };
}
