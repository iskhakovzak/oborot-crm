import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Атомарный сквозной номер: сделки, счета, договоры, ЭСФ, заказы в производство */
export async function nextNumber(key: "deal" | "invoice" | "contract" | "upd" | "act" | "kp" | "production" | "report"): Promise<number> {
  await db.insert(schema.counters).values({ key, value: 1 }).onConflictDoUpdate({ target: schema.counters.key, set: { value: sql`${schema.counters.value} + 1` } });
  const row = await db.query.counters.findFirst({ where: (c, { eq }) => eq(c.key, key) });
  return row?.value ?? 1;
}
export function docNumber(prefix: string, n: number) {
  const y = new Date().getFullYear();
  return `${prefix}-${y}-${String(n).padStart(4, "0")}`;
}
