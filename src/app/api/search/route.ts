import { NextResponse } from "next/server";
import { ilike, or, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json([]);
  const p = `%${q}%`;
  const out: { type: string; id: string; title: string; subtitle?: string; href: string }[] = [];
  if (can(user.actor, "companies", "view")) {
    const rows = await db.select().from(schema.companies).where(or(ilike(schema.companies.name, p), ilike(schema.companies.inn, p), ilike(schema.companies.phone, p), ilike(schema.companies.email, p))).limit(5);
    out.push(...rows.map((c) => ({ type: "company", id: c.id, title: c.name, subtitle: c.inn ? `ИНН ${c.inn}` : undefined, href: `/companies/${c.id}` })));
  }
  if (can(user.actor, "contacts", "view")) {
    const rows = await db.select().from(schema.contacts).where(or(ilike(schema.contacts.name, p), ilike(schema.contacts.phone, p), ilike(schema.contacts.email, p))).limit(4);
    out.push(...rows.map((c) => ({ type: "contact", id: c.id, title: c.name, subtitle: c.phone ?? c.email ?? undefined, href: c.companyId ? `/companies/${c.companyId}` : "/companies" })));
  }
  if (can(user.actor, "deals", "view")) {
    const num = Number(q.replace(/\D/g, "")) || -1;
    const rows = await db.select().from(schema.deals).where(or(ilike(schema.deals.title, p), eq(schema.deals.number, num))).orderBy(desc(schema.deals.updatedAt)).limit(5);
    out.push(...rows.map((d) => ({ type: "deal", id: d.id, title: `№${d.number} ${d.title}`, subtitle: `${d.amount.toLocaleString("ru-RU")} сум`, href: `/deals/${d.id}` })));
  }
  if (can(user.actor, "documents", "view")) {
    const rows = await db.select().from(schema.documents).where(or(ilike(schema.documents.number, p), ilike(schema.documents.title, p))).limit(4);
    out.push(...rows.map((d) => ({ type: "document", id: d.id, title: d.title, subtitle: `${d.amount.toLocaleString("ru-RU")} сум`, href: `/documents/${d.id}` })));
  }
  return NextResponse.json(out);
}
