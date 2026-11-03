import { cookies } from "next/headers";
import { cache } from "react";
import { eq, and, gt, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, schema } from "@/db";
import { newId } from "./utils";
import type { Actor } from "./permissions";
import { redirect } from "next/navigation";

const COOKIE = "crm_session";
const TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  color: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  teamId: string | null;
  telegramChatId: string | null;
  actor: Actor;
};

/** Вход по email или Telegram-нику (с @ или без) */
export async function login(identifier: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = identifier.trim().toLowerCase().replace(/^@/, "");
  const user = await db.query.users.findFirst({ where: or(eq(schema.users.email, id), eq(schema.users.telegramUsername, id)) });
  if (!user || !user.isActive) return { ok: false, error: "Пользователь с таким email или Telegram не найден" };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { ok: false, error: "Неверный пароль" };
  const sid = newId("ses");
  const expires = new Date(Date.now() + TTL_DAYS * 86400_000);
  await db.insert(schema.sessions).values({ id: sid, userId: user.id, expiresAt: expires.toISOString() });
  const jar = await cookies();
  jar.set(COOKIE, sid, { httpOnly: true, sameSite: "lax", path: "/", expires, secure: process.env.NODE_ENV === "production" });
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return null;
  const row = await db
    .select({ user: schema.users, role: schema.roles })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, new Date().toISOString())))
    .then((r) => r[0]);
  if (!row || !row.user.isActive) return null;
  const { user, role } = row;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    color: user.color,
    roleId: role.id,
    roleName: role.name,
    roleSlug: role.slug,
    teamId: user.teamId,
    telegramChatId: user.telegramChatId,
    actor: { id: user.id, teamId: user.teamId, permissions: role.permissions, isAdmin: role.slug === "admin" },
  };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 10);
}
