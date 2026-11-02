import { db, schema } from "@/db";
import type { ActivityType } from "@/db/schema";
import { newId } from "./utils";

export async function logActivity(a: {
  type: ActivityType; title: string; body?: string | null; dealId?: string | null; companyId?: string | null; contactId?: string | null; userId?: string | null; meta?: Record<string, unknown>;
}) {
  const id = newId("act");
  await db.insert(schema.activities).values({ id, type: a.type, title: a.title, body: a.body ?? null, dealId: a.dealId ?? null, companyId: a.companyId ?? null, contactId: a.contactId ?? null, userId: a.userId ?? null, meta: a.meta ?? null });
  return id;
}

export async function audit(userId: string | null, entity: string, entityId: string, action: "create" | "update" | "delete" | "view", diff?: Record<string, unknown>) {
  await db.insert(schema.auditLog).values({ id: newId("aud"), userId, entity, entityId, action, diff: diff ?? null });
}
