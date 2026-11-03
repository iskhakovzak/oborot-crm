import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { db, schema, isPglite } from "@/db";
import { ensureDatabase } from "@/db/ensure";

export const dynamic = "force-dynamic";

/** Диагностика окружения: доступность базы, число пользователей, наличие подготовленных данных */
export async function GET() {
  const ensure = await ensureDatabase();
  let users: number | null = null, dbError: string | null = null;
  try {
    const [{ n }] = await db.select({ n: count() }).from(schema.users);
    users = n;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }
  const bundled = path.join(process.cwd(), "data", "pg");
  return NextResponse.json({
    ok: !dbError && users !== null && users > 0,
    engine: isPglite ? "pglite" : "postgres",
    users,
    dbError,
    ensure,
    bundledDataDir: fs.existsSync(path.join(bundled, "PG_VERSION")),
    migrationsDir: fs.existsSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json")),
    cwd: process.cwd(),
    vercel: !!process.env.VERCEL,
    node: process.version,
  });
}
