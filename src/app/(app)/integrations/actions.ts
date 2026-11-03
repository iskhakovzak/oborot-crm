"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { IntegrationKind } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { audit } from "@/lib/activity";
import { CATALOG, resolve, logEvent } from "@/lib/integrations/registry";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function def(kind: IntegrationKind, provider: string) {
  const d = CATALOG.find((c) => c.kind === kind && c.provider === provider);
  if (!d) throw new Error("Провайдер не найден в каталоге");
  return d;
}

async function row(kind: IntegrationKind, provider: string) {
  return db.query.integrations.findFirst({ where: and(eq(schema.integrations.kind, kind), eq(schema.integrations.provider, provider)) });
}

/** Обязательные поля — все без подсказки hint (как в registry.resolve) */
function statusFor(kind: IntegrationKind, provider: string, config: Record<string, string>): "connected" | "sandbox" {
  const d = def(kind, provider);
  const required = d.fields.filter((f) => !f.hint).map((f) => f.key);
  return required.every((k) => config[k]?.trim()) ? "connected" : "sandbox";
}

export async function toggleIntegration(kind: IntegrationKind, provider: string, isEnabled: boolean): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "integrations", "edit")) return fail("Нет прав на изменение интеграций");
  try {
    const d = def(kind, provider);
    const existing = await row(kind, provider);
    if (existing) await db.update(schema.integrations).set({ isEnabled }).where(eq(schema.integrations.id, existing.id));
    else await db.insert(schema.integrations).values({ id: newId("int"), kind, provider, name: d.name, config: {}, isEnabled, status: "sandbox" });
    await audit(user.id, "integration", existing?.id ?? `${kind}:${provider}`, "update", { provider, isEnabled });
    revalidatePath("/integrations");
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

/** Сохранение ключей: пустое значение секретного поля оставляет прежнее */
export async function saveIntegration(kind: IntegrationKind, provider: string, config: Record<string, string>, isEnabled?: boolean): Promise<{ ok: true; status: "connected" | "sandbox" } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "integrations", "edit")) return fail("Нет прав на изменение интеграций");
  try {
    const d = def(kind, provider);
    const existing = await row(kind, provider);
    const next: Record<string, string> = { ...(existing?.config ?? {}) };
    for (const f of d.fields) {
      const v = (config[f.key] ?? "").trim();
      if (f.secret && !v) continue;
      if (v) next[f.key] = v;
      else delete next[f.key];
    }
    const status = statusFor(kind, provider, next);
    const enabled = isEnabled ?? existing?.isEnabled ?? true;
    if (existing) await db.update(schema.integrations).set({ config: next, status, isEnabled: enabled, lastError: null }).where(eq(schema.integrations.id, existing.id));
    else await db.insert(schema.integrations).values({ id: newId("int"), kind, provider, name: d.name, config: next, isEnabled: enabled, status });
    await audit(user.id, "integration", existing?.id ?? `${kind}:${provider}`, "update", { provider, status, keys: Object.keys(next) });
    revalidatePath("/integrations");
    return { ok: true, status };
  } catch (e) {
    return fail(msg(e));
  }
}

type GetMe = { ok: boolean; username?: string; description?: string };
async function telegramGetMe(token: string): Promise<GetMe> {
  try {
    const j = (await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json()) as { ok?: boolean; result?: { username?: string }; description?: string };
    return { ok: !!j.ok, username: j.result?.username, description: j.description };
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

export type TestResult = { ok: true; live: boolean; title: string; lines: string[] } | Fail;

/** Проверка интеграции: для данных — реальный запрос, для каналов — только проверка ключей (ничего не отправляем) */
export async function testIntegration(kind: IntegrationKind, provider: string): Promise<TestResult> {
  const user = await requireUser();
  if (!can(user.actor, "integrations", "view")) return fail("Нет доступа к интеграциям");
  try {
    const d = def(kind, provider);
    const r = await resolve(kind, provider);
    const existing = await row(kind, provider);
    const mode = r.live ? "Подключено, ключи заданы" : "Демо-режим: без ключей";
    const lines: string[] = [];
    let title = `${d.name}: ${mode}`;
    const required = d.fields.filter((f) => !f.hint);
    const missing = required.filter((f) => !r.config[f.key]).map((f) => f.label);
    const started = Date.now();
    switch (kind) {
      case "company_data": {
        const { lookupCompanyByInn } = await import("@/lib/integrations/company-data");
        const c = await lookupCompanyByInn("7707083893");
        if (!c) return fail("Поиск по ИНН 7707083893 ничего не вернул");
        lines.push(`ИНН 7707083893 → ${c.name}`, `Адрес: ${c.legalAddress ?? "—"}`, `Руководитель: ${c.director ?? "—"}`);
        break;
      }
      case "product_data": {
        const { lookupProduct } = await import("@/lib/integrations/product-data");
        const p = await lookupProduct("4601234567890");
        if (!p) return fail("Штрихкод 4601234567890 не найден");
        lines.push(`Штрихкод 4601234567890 → ${p.name}`, `Бренд: ${p.brand || "—"} · Категория: ${p.category || "—"}`);
        break;
      }
      case "sbp": {
        const { createPaymentLink } = await import("@/lib/integrations/sbp");
        const link = await createPaymentLink({ amount: 10, purpose: "Тест интеграции СБП", ttlHours: 1 });
        lines.push(`Ссылка на оплату 10 ₽ создана${link.sandbox ? " (демо-страница CRM)" : " банком"}`, link.url);
        break;
      }
      case "bank": {
        const { fetchStatement } = await import("@/lib/integrations/bank");
        const st = await fetchStatement();
        lines.push(`Выписка получена: ${st.rows.length} операций${st.sandbox ? " (демо-данные под неоплаченные счета)" : ""}`);
        if (st.rows[0]) lines.push(`Первая: ${st.rows[0].counterpartyName} — ${st.rows[0].amount.toLocaleString("ru-RU")} ₽`);
        break;
      }
      case "ai": {
        const { describeProduct } = await import("@/lib/integrations/ai");
        const res = await describeProduct("Тест");
        lines.push(res.sandbox ? "Ответ сформирован встроенным шаблоном (без ключа)" : `Модель ответила: ${res.description.slice(0, 120)}…`);
        break;
      }
      case "edo":
      case "finance":
      case "analytics":
      case "sms":
      case "email":
      case "messenger":
      case "telephony":
      case "telegram_bot": {
        if (missing.length) lines.push(`Не заполнено: ${missing.join(", ")}`);
        else lines.push("Все обязательные поля заполнены");
        if ((kind === "telegram_bot" || (kind === "messenger" && provider === "telegram")) && r.live && r.config.botToken) {
          const res = await telegramGetMe(r.config.botToken);
          if (res.ok) lines.push(`Бот отвечает: @${res.username ?? "?"}`);
          else return fail(`Telegram API: ${res.description ?? "нет ответа"}`);
        } else {
          lines.push(r.live ? "Отправка не выполнялась — только проверка настроек" : "Сообщения и документы будут логироваться в журнале, наружу ничего не уходит");
        }
        break;
      }
    }
    lines.push(`Время: ${Date.now() - started} мс`);
    await logEvent({ kind: "integration.test", provider, direction: "out", payload: { kind, lines, userId: user.id }, status: r.live ? "ok" : "sandbox", integrationId: existing?.id ?? null });
    if (existing) await db.update(schema.integrations).set({ lastSyncAt: new Date().toISOString(), lastError: null }).where(eq(schema.integrations.id, existing.id));
    if (!r.live) title = `${d.name}: демо-режим`;
    revalidatePath("/integrations");
    return { ok: true, live: r.live, title, lines };
  } catch (e) {
    const existing = await row(kind, provider);
    if (existing) await db.update(schema.integrations).set({ lastError: msg(e) }).where(eq(schema.integrations.id, existing.id));
    await logEvent({ kind: "integration.test", provider, direction: "out", payload: { kind, error: msg(e) }, status: "error", integrationId: existing?.id ?? null });
    revalidatePath("/integrations");
    return fail(msg(e));
  }
}
