"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, count } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PermissionMap, PermScope } from "@/db/schema";
import { requireUser, hashPassword } from "@/lib/auth";
import { can, ENTITIES, adminPermissions } from "@/lib/permissions";
import { newId } from "@/lib/utils";
import { audit } from "@/lib/activity";
import { getSetting, setSetting, type BookingSettings, type CompanyProfile, type DistributionSettings } from "@/lib/settings";
import { pickManager } from "@/lib/distribution";

type Fail = { error: string };
const fail = (error: string): Fail => ({ error });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SCOPES: PermScope[] = ["all", "team", "own", "none"];

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

// ───────────────────────────── Компания ─────────────────────────────

export async function saveCompany(input: Partial<CompanyProfile>): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return fail("Нет прав на изменение настроек");
  try {
    const name = String(input.name ?? "").trim();
    if (!name) return fail("Укажите название компании");
    const patch: Partial<CompanyProfile> = {};
    for (const k of ["name", "shortName", "inn", "oked", "regNumber", "address", "director", "directorPosition", "accountant", "bankName", "mfo", "account", "phone", "email"] as const) {
      if (input[k] !== undefined) patch[k] = String(input[k] ?? "").trim();
    }
    if (input.vatPayer !== undefined) patch.vatPayer = !!input.vatPayer;
    if (input.vatRate !== undefined) patch.vatRate = Math.max(0, Math.min(100, Number(input.vatRate) || 0));
    await setSetting("company", patch);
    await audit(user.id, "settings", "company", "update", patch as Record<string, unknown>);
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Сотрудники ─────────────────────────────

export type UserInput = {
  id?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  password?: string | null;
  roleId: string;
  teamId?: string | null;
  acceptsLeads: boolean;
  leadWeight: number;
  skills: string[];
  workStart: string;
  workEnd: string;
  workDays: number[];
  color: string;
};

export async function saveUser(input: UserInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return fail("Нет прав на изменение сотрудников");
  try {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) return fail("Укажите имя");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Некорректный email");
    const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, input.roleId) });
    if (!role) return fail("Роль не найдена");
    const dup = await db.query.users.findFirst({ where: input.id ? and(eq(schema.users.email, email), ne(schema.users.id, input.id)) : eq(schema.users.email, email) });
    if (dup) return fail("Сотрудник с таким email уже есть");
    const values = {
      name,
      email,
      phone: input.phone?.trim() || null,
      roleId: role.id,
      teamId: input.teamId?.trim() || null,
      acceptsLeads: !!input.acceptsLeads,
      leadWeight: Math.max(1, Math.min(10, Math.round(Number(input.leadWeight) || 1))),
      skills: (input.skills ?? []).map((s) => s.trim()).filter(Boolean),
      workStart: /^\d{2}:\d{2}$/.test(input.workStart) ? input.workStart : "09:00",
      workEnd: /^\d{2}:\d{2}$/.test(input.workEnd) ? input.workEnd : "18:00",
      workDays: (input.workDays ?? []).filter((d) => d >= 0 && d <= 6),
      color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : "#2456D6",
    };
    const password = input.password?.trim();
    if (input.id) {
      const existing = await db.query.users.findFirst({ where: eq(schema.users.id, input.id) });
      if (!existing) return fail("Сотрудник не найден");
      if (existing.id === user.id && role.slug !== user.roleSlug) return fail("Нельзя сменить собственную роль");
      await db.update(schema.users).set({ ...values, ...(password ? { passwordHash: await hashPassword(password) } : {}) }).where(eq(schema.users.id, input.id));
      await audit(user.id, "user", input.id, "update", { ...values, passwordChanged: !!password });
      revalidate();
      return { ok: true, id: input.id };
    }
    if (!password || password.length < 6) return fail("Пароль не короче 6 символов");
    const id = newId("usr");
    await db.insert(schema.users).values({ id, ...values, passwordHash: await hashPassword(password) });
    await audit(user.id, "user", id, "create", { name, email, roleId: role.id });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function setUserActive(id: string, isActive: boolean): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return fail("Нет прав на изменение сотрудников");
  try {
    if (id === user.id && !isActive) return fail("Нельзя деактивировать самого себя");
    await db.update(schema.users).set({ isActive }).where(eq(schema.users.id, id));
    if (!isActive) await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
    await audit(user.id, "user", id, "update", { isActive });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Роли и права ─────────────────────────────

export type RoleInput = { id?: string | null; name: string; description?: string | null; permissions: PermissionMap };

function normalizePermissions(p: PermissionMap): PermissionMap {
  const out: PermissionMap = {};
  for (const e of ENTITIES) {
    const src = p[e.key] ?? { view: "none", create: false, edit: "none", delete: "none", hiddenFields: [], readonlyFields: [] };
    const fields = e.fields as readonly string[];
    out[e.key] = {
      view: SCOPES.includes(src.view) ? src.view : "none",
      create: !!src.create,
      edit: SCOPES.includes(src.edit) ? src.edit : "none",
      delete: SCOPES.includes(src.delete) ? src.delete : "none",
      hiddenFields: (src.hiddenFields ?? []).filter((f) => fields.includes(f)),
      readonlyFields: (src.readonlyFields ?? []).filter((f) => fields.includes(f)),
    };
  }
  return out;
}

function slugify(name: string) {
  const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  const s = name.toLowerCase().split("").map((ch) => map[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return s || "role";
}

export async function saveRole(input: RoleInput): Promise<{ ok: true; id: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return fail("Нет прав на изменение ролей");
  try {
    const name = input.name.trim();
    if (!name) return fail("Укажите название роли");
    const description = input.description?.trim() || null;
    if (input.id) {
      const existing = await db.query.roles.findFirst({ where: eq(schema.roles.id, input.id) });
      if (!existing) return fail("Роль не найдена");
      // администратора урезать нельзя: права всегда полные
      const permissions = existing.slug === "admin" ? adminPermissions() : normalizePermissions(input.permissions);
      await db.update(schema.roles).set({ name, description, permissions }).where(eq(schema.roles.id, input.id));
      await audit(user.id, "role", input.id, "update", { name, permissions: Object.fromEntries(Object.entries(permissions).map(([k, v]) => [k, `${v.view}/${v.create ? "c" : "-"}/${v.edit}/${v.delete}`])) });
      revalidate();
      return { ok: true, id: input.id };
    }
    const id = newId("role");
    let slug = slugify(name);
    if (await db.query.roles.findFirst({ where: eq(schema.roles.slug, slug) })) slug = `${slug}_${id.slice(-4).toLowerCase()}`;
    const permissions = normalizePermissions(input.permissions);
    await db.insert(schema.roles).values({ id, name, slug, description, permissions, isSystem: false });
    await audit(user.id, "role", id, "create", { name, slug });
    revalidate();
    return { ok: true, id };
  } catch (e) {
    return fail(msg(e));
  }
}

export async function deleteRole(id: string): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "delete")) return fail("Нет прав на удаление ролей");
  try {
    const role = await db.query.roles.findFirst({ where: eq(schema.roles.id, id) });
    if (!role) return fail("Роль не найдена");
    if (role.isSystem) return fail("Системную роль удалить нельзя");
    const [{ n }] = await db.select({ n: count() }).from(schema.users).where(eq(schema.users.roleId, id));
    if (n > 0) return fail(`Роль назначена ${n} сотрудникам — сначала переназначьте их`);
    await db.delete(schema.roles).where(eq(schema.roles.id, id));
    await audit(user.id, "role", id, "delete", { name: role.name });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Распределение заявок ─────────────────────────────

export async function saveDistribution(input: Partial<DistributionSettings>): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return fail("Нет прав на изменение настроек");
  try {
    const patch: Partial<DistributionSettings> = {};
    if (input.mode && ["round_robin", "least_loaded", "by_source", "by_skill"].includes(input.mode)) patch.mode = input.mode;
    if (input.managerIds) patch.managerIds = input.managerIds.filter(Boolean);
    if (input.sourceRules) patch.sourceRules = input.sourceRules.map((r) => ({ source: r.source.trim(), managerId: r.managerId })).filter((r) => r.source && r.managerId);
    if (input.skillRules) patch.skillRules = input.skillRules.map((r) => ({ tag: r.tag.trim(), managerIds: (r.managerIds ?? []).filter(Boolean) })).filter((r) => r.tag && r.managerIds.length);
    if (input.notifyManager !== undefined) patch.notifyManager = !!input.notifyManager;
    await setSetting("distribution", patch);
    await audit(user.id, "settings", "distribution", "update", patch as Record<string, unknown>);
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

/** Кого выберет распределение для заявки с таким источником/тегами (round robin при этом сдвигает очередь) */
export async function testDistribution(p: { source?: string | null; tags?: string[] | null }): Promise<{ ok: true; managerId: string | null; name: string | null; mode: string } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "view")) return fail("Нет доступа к настройкам");
  try {
    const s = await getSetting("distribution");
    const id = await pickManager({ source: p.source ?? null, tags: p.tags?.filter(Boolean) ?? null });
    const u = id ? await db.query.users.findFirst({ where: eq(schema.users.id, id) }) : null;
    return { ok: true, managerId: id, name: u?.name ?? null, mode: s.mode };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Онлайн-запись ─────────────────────────────

export async function saveBooking(input: Partial<BookingSettings>): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!can(user.actor, "settings", "edit")) return fail("Нет прав на изменение настроек");
  try {
    const patch: Partial<BookingSettings> = {};
    if (input.confirmByChannel && ["telegram", "whatsapp", "email", "sms"].includes(input.confirmByChannel)) patch.confirmByChannel = input.confirmByChannel;
    if (input.createLead !== undefined) patch.createLead = !!input.createLead;
    if (input.defaultPipelineId !== undefined) patch.defaultPipelineId = input.defaultPipelineId || null;
    await setSetting("booking", patch);
    await audit(user.id, "settings", "booking", "update", patch as Record<string, unknown>);
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

// ───────────────────────────── Профиль ─────────────────────────────

export async function saveProfile(input: { name: string; phone?: string | null; password?: string | null; color?: string | null }): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  try {
    const name = input.name.trim();
    if (!name) return fail("Укажите имя");
    const set: Partial<typeof schema.users.$inferInsert> = { name, phone: input.phone?.trim() || null };
    if (input.color && /^#[0-9a-f]{6}$/i.test(input.color)) set.color = input.color;
    const password = input.password?.trim();
    if (password) {
      if (password.length < 6) return fail("Пароль не короче 6 символов");
      set.passwordHash = await hashPassword(password);
    }
    await db.update(schema.users).set(set).where(eq(schema.users.id, user.id));
    await audit(user.id, "user", user.id, "update", { name, phone: set.phone, passwordChanged: !!password });
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(msg(e));
  }
}

