"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, hiddenFields } from "@/lib/permissions";
import { sendConversion } from "@/lib/integrations/metrika";

/** 27. Повторная отправка конверсии в Яндекс Метрику / сквозную аналитику */
export async function resendExport(exportId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!can(user.actor, "analytics", "view") || hiddenFields(user.actor, "analytics").includes("marketing")) return { ok: false, message: "Нет доступа к маркетинговой аналитике" };
  const row = await db.query.analyticsExports.findFirst({ where: eq(schema.analyticsExports.id, exportId) });
  if (!row || !row.dealId) return { ok: false, message: "Запись не найдена" };
  const r = await sendConversion({ dealId: row.dealId, goal: row.goal, revenue: row.revenue ?? undefined });
  revalidatePath("/analytics");
  return { ok: r.ok, message: r.message };
}
