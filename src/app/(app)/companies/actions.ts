"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, canRecord, hiddenFields, readonlyFields } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { pickManager } from "@/lib/distribution";
import { lookupCompanyByInn, validateInn } from "@/lib/integrations/company-data";
import { createClientReport } from "@/lib/documents/service";
import { sendMessage } from "@/lib/integrations/messaging";
import { placeCall } from "@/lib/integrations/telephony";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadCompany(id: string) {
  const row = await db.select({ company: schema.companies, ownerTeamId: schema.users.teamId }).from(schema.companies).leftJoin(schema.users, eq(schema.companies.managerId, schema.users.id)).where(eq(schema.companies.id, id)).then((r) => r[0]);
  return row ?? null;
}
async function editableCompany(user: SessionUser, id: string) {
  if (!can(user.actor, "companies", "edit")) throw new Error("Нет прав на изменение клиентов");
  const row = await loadCompany(id);
  if (!row) throw new Error("Клиент не найден");
  if (!canRecord(user.actor, "companies", "edit", { ownerId: row.company.managerId, ownerTeamId: row.ownerTeamId })) throw new Error("Клиент закреплён за другим менеджером");
  return row.company;
}
async function viewableCompany(user: SessionUser, id: string) {
  if (!can(user.actor, "companies", "view")) throw new Error("Нет доступа к клиентам");
  const row = await loadCompany(id);
  if (!row) throw new Error("Клиент не найден");
  if (!canRecord(user.actor, "companies", "view", { ownerId: row.company.managerId, ownerTeamId: row.ownerTeamId })) throw new Error("Нет доступа к этому клиенту");
  return row.company;
}
function revalidateCompany(id: string) {
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
}

export type CompanyInput = Partial<{
  name: string; shortName: string | null; inn: string | null; kpp: string | null; ogrn: string | null; okved: string | null; legalAddress: string | null; address: string | null;
  director: string | null; directorPosition: string | null; bankName: string | null; bik: string | null; account: string | null; corrAccount: string | null;
  email: string | null; phone: string | null; website: string | null; industry: string | null; status: "lead" | "client" | "partner" | "archived"; source: string | null;
  managerId: string | null; tags: string[]; notes: string | null; balance: number;
}>;

const FIELDS = ["name", "shortName", "inn", "kpp", "ogrn", "okved", "legalAddress", "address", "director", "directorPosition", "bankName", "bik", "account", "corrAccount", "email", "phone", "website", "industry", "status", "source", "managerId", "tags", "notes", "balance"] as const;

function sanitize(user: SessionUser, input: CompanyInput, forCreate: boolean): Record<string, unknown> {
  const ro = readonlyFields(user.actor, "companies");
  const hidden = hiddenFields(user.actor, "companies");
  const set: Record<string, unknown> = {};
  for (const k of FIELDS) {
    const v = input[k];
    if (v === undefined) continue;
    if (hidden.includes(k) || (!forCreate && ro.includes(k))) throw new Error(`Поле «${k}» недоступно для вашей роли`);
    set[k] = typeof v === "string" ? v.trim() || null : v;
  }
  if (set.inn && !validateInn(String(set.inn))) throw new Error("ИНН не проходит проверку контрольной суммы");
  if (set.balance !== undefined) set.balance = Number(set.balance) || 0;
  if (Array.isArray(set.tags)) set.tags = (set.tags as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean);
  return set;
}

export async function createCompany(input: CompanyInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "companies", "create")) return fail("Нет прав на создание клиентов");
  try {
    const set = sanitize(user, input, true);
    const name = String(set.name ?? "").trim();
    if (!name) return fail("Укажите название");
    if (set.inn) {
      const dup = await db.query.companies.findFirst({ where: eq(schema.companies.inn, String(set.inn)) });
      if (dup) return fail(`Клиент с ИНН ${set.inn} уже есть: ${dup.name}`);
    }
    const id = newId("cmp");
    const managerId = (set.managerId as string | null) || (await pickManager({ source: (set.source as string | null) ?? null, tags: (set.tags as string[] | undefined) ?? null })) || user.id;
    await db.insert(schema.companies).values({ ...(set as typeof schema.companies.$inferInsert), id, name, status: (set.status as "lead" | "client" | "partner" | "archived") ?? "lead", managerId });
    await logActivity({ type: "system", title: `Клиент создан${set.source ? ` из источника «${set.source}»` : ""}`, companyId: id, userId: user.id, meta: { managerId } });
    revalidatePath("/companies");
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function updateCompany(id: string, input: CompanyInput): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const company = await editableCompany(user, id);
    const set = sanitize(user, input, false);
    if ("name" in set && !set.name) return fail("Название не может быть пустым");
    if (set.inn && set.inn !== company.inn) {
      const dup = await db.query.companies.findFirst({ where: eq(schema.companies.inn, String(set.inn)) });
      if (dup && dup.id !== id) return fail(`ИНН ${set.inn} уже используется: ${dup.name}`);
    }
    if (!Object.keys(set).length) return { ok: true };
    await db.update(schema.companies).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(schema.companies.id, id));
    const labels: Record<string, string> = { name: "название", status: "статус", managerId: "менеджер", tags: "теги", inn: "ИНН", phone: "телефон", email: "email", notes: "заметки", bankName: "банк", account: "счёт" };
    await logActivity({ type: "system", title: `Изменено: ${Object.keys(set).map((k) => labels[k] ?? k).join(", ")}`, companyId: id, userId: user.id });
    revalidateCompany(id);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

/** 4. Обновить реквизиты из ЕГРЮЛ по ИНН */
export async function refreshCompanyByInn(id: string, innOverride?: string): Promise<{ ok: true; name: string; source: string } | Fail> {
  const user = await requireUser();
  try {
    const company = await editableCompany(user, id);
    const inn = (innOverride ?? company.inn ?? "").replace(/\D/g, "");
    if (!inn) return fail("У клиента не указан ИНН");
    const data = await lookupCompanyByInn(inn);
    if (!data) return fail("Компания по этому ИНН не найдена");
    await db.update(schema.companies).set({ name: data.name, shortName: data.shortName, inn: data.inn, kpp: data.kpp || null, ogrn: data.ogrn || null, okved: data.okved || null, legalAddress: data.legalAddress || null, director: data.director || null, directorPosition: data.directorPosition || null, updatedAt: new Date().toISOString() }).where(eq(schema.companies.id, id));
    await logActivity({ type: "system", title: `Реквизиты обновлены по ИНН ${inn}`, body: `${data.name}, ${data.status}${data.source === "sandbox" ? " (демо-данные)" : ""}`, companyId: id, userId: user.id });
    revalidateCompany(id);
    return { ok: true, name: data.name, source: data.source };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Контакты ─────────────────────────────

export type ContactInput = { name: string; position?: string | null; phone?: string | null; email?: string | null; telegram?: string | null; whatsapp?: string | null; max?: string | null; vk?: string | null; isPrimary?: boolean; birthday?: string | null };

function cleanContact(input: ContactInput) {
  const s = (v: string | null | undefined) => (v ?? "").trim() || null;
  return { name: input.name.trim(), position: s(input.position), phone: s(input.phone), email: s(input.email), telegram: s(input.telegram), whatsapp: s(input.whatsapp), max: s(input.max), vk: s(input.vk), isPrimary: !!input.isPrimary, birthday: s(input.birthday) };
}

export async function addContact(companyId: string, input: ContactInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  try {
    await viewableCompany(user, companyId);
    if (!can(user.actor, "contacts", "create")) return fail("Нет прав на создание контактов");
    const c = cleanContact(input);
    if (!c.name) return fail("Укажите имя контакта");
    const id = newId("cnt");
    const count = await db.query.contacts.findMany({ where: eq(schema.contacts.companyId, companyId) });
    if (c.isPrimary) await db.update(schema.contacts).set({ isPrimary: false }).where(eq(schema.contacts.companyId, companyId));
    await db.insert(schema.contacts).values({ id, companyId, ...c, isPrimary: c.isPrimary || count.length === 0 });
    await logActivity({ type: "system", title: `Добавлен контакт: ${c.name}`, companyId, contactId: id, userId: user.id });
    revalidateCompany(companyId);
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function updateContact(contactId: string, input: ContactInput): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const contact = await db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) });
    if (!contact) return fail("Контакт не найден");
    if (!can(user.actor, "contacts", "edit")) return fail("Нет прав на изменение контактов");
    if (contact.companyId) await viewableCompany(user, contact.companyId);
    const c = cleanContact(input);
    if (!c.name) return fail("Укажите имя контакта");
    if (c.isPrimary && contact.companyId) await db.update(schema.contacts).set({ isPrimary: false }).where(eq(schema.contacts.companyId, contact.companyId));
    await db.update(schema.contacts).set(c).where(eq(schema.contacts.id, contactId));
    if (contact.companyId) revalidateCompany(contact.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteContact(contactId: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const contact = await db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) });
    if (!contact) return fail("Контакт не найден");
    if (!can(user.actor, "contacts", "delete")) return fail("Нет прав на удаление контактов");
    if (contact.companyId) await viewableCompany(user, contact.companyId);
    await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
    await logActivity({ type: "system", title: `Удалён контакт: ${contact.name}`, companyId: contact.companyId, userId: user.id });
    if (contact.companyId) revalidateCompany(contact.companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Отчёт, связь, заметки ─────────────────────────────

/** 22. Отчёт для клиента за период + ИИ-резюме */
export async function clientReport(companyId: string, months = 3): Promise<{ ok: true; id: string; number: string; summary: string; aiSandbox: boolean } | Fail> {
  const user = await requireUser();
  try {
    await viewableCompany(user, companyId);
    if (!can(user.actor, "documents", "create")) return fail("Нет прав на создание документов");
    const r = await createClientReport(companyId, { months, userId: user.id });
    revalidateCompany(companyId);
    revalidatePath("/documents");
    return { ok: true, id: r.id, number: r.number, summary: r.summary, aiSandbox: r.aiSandbox };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function callCompany(companyId: string, contactId?: string | null): Promise<{ ok: true; phone: string; sandbox: boolean } | Fail> {
  const user = await requireUser();
  try {
    const company = await viewableCompany(user, companyId);
    const contact = contactId ? await db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) }) : (await db.query.contacts.findFirst({ where: and(eq(schema.contacts.companyId, companyId), eq(schema.contacts.isPrimary, true)) })) ?? (await db.query.contacts.findFirst({ where: eq(schema.contacts.companyId, companyId) }));
    const phone = contact?.phone ?? company.phone;
    if (!phone) return fail("У клиента не указан телефон");
    const r = await placeCall({ phone, userId: user.id, contactId: contact?.id, companyId });
    revalidateCompany(companyId);
    revalidatePath("/calls");
    return { ok: true, phone, sandbox: r.sandbox };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function messageCompany(companyId: string, text: string, contactId?: string | null): Promise<{ ok: true; channel: string | null; sandbox: boolean } | Fail> {
  const user = await requireUser();
  try {
    await viewableCompany(user, companyId);
    const t = text.trim();
    if (!t) return fail("Введите текст сообщения");
    const r = await sendMessage({ channel: "preferred", text: t, companyId, contactId: contactId ?? null, userId: user.id });
    if (!r.ok) return fail(r.error ?? "Не удалось отправить");
    await logActivity({ type: "message", title: `Сообщение клиенту (${r.channel})`, body: t, companyId, contactId: contactId ?? null, userId: user.id, meta: { conversationId: r.conversationId } });
    revalidateCompany(companyId);
    revalidatePath("/inbox");
    return { ok: true, channel: r.channel, sandbox: r.sandbox };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function addCompanyNote(companyId: string, text: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    await viewableCompany(user, companyId);
    const t = text.trim();
    if (!t) return fail("Пустая заметка");
    await logActivity({ type: "note", title: "Заметка", body: t, companyId, userId: user.id });
    revalidateCompany(companyId);
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}
