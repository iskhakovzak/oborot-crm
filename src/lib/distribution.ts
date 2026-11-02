import { and, count, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSetting, setSetting } from "./settings";

/** 25. Распределение заявок между менеджерами: по кругу, по загрузке, по источнику, по навыкам */
export async function pickManager(p: { source?: string | null; tags?: string[] | null }): Promise<string | null> {
  const s = await getSetting("distribution");
  const all = await db.select({ id: schema.users.id, weight: schema.users.leadWeight, skills: schema.users.skills, roleId: schema.users.roleId }).from(schema.users).where(and(eq(schema.users.isActive, true), eq(schema.users.acceptsLeads, true)));
  const pool = (s.managerIds.length ? all.filter((u) => s.managerIds.includes(u.id)) : all);
  if (!pool.length) return null;
  if (s.mode === "by_source" && p.source) {
    const rule = s.sourceRules.find((r) => r.source.toLowerCase() === p.source!.toLowerCase());
    if (rule && pool.some((u) => u.id === rule.managerId)) return rule.managerId;
  }
  if (s.mode === "by_skill" && p.tags?.length) {
    for (const tag of p.tags) {
      const rule = s.skillRules.find((r) => r.tag.toLowerCase() === tag.toLowerCase());
      const candidates = rule ? pool.filter((u) => rule.managerIds.includes(u.id)) : pool.filter((u) => (u.skills ?? []).map((x) => x.toLowerCase()).includes(tag.toLowerCase()));
      if (candidates.length) return leastLoaded(candidates.map((c) => c.id));
    }
  }
  if (s.mode === "least_loaded") return leastLoaded(pool.map((u) => u.id));
  // round robin с учётом веса
  const ring = pool.flatMap((u) => Array(Math.max(1, u.weight)).fill(u.id) as string[]);
  const idx = (s.lastIndex + 1) % ring.length;
  await setSetting("distribution", { lastIndex: idx });
  return ring[idx];
}

async function leastLoaded(ids: string[]): Promise<string> {
  const rows = await db.select({ id: schema.deals.managerId, n: count() }).from(schema.deals).where(and(eq(schema.deals.status, "open"), inArray(schema.deals.managerId, ids))).groupBy(schema.deals.managerId);
  const load = new Map(rows.map((r) => [r.id, r.n]));
  return [...ids].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
}
