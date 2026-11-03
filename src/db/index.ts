import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

/**
 * Подключение к базе.
 * - DATABASE_URL=postgres://… — внешний Postgres (Supabase, Neon, свой сервер).
 * - иначе — встроенный PGlite (Postgres в процессе Node): локально в data/pg,
 *   на serverless-хостинге копия подготовленной при сборке базы разворачивается в /tmp.
 */
const url = process.env.DATABASE_URL ?? "";
const g = globalThis as unknown as { __crmDb?: Db; __crmPg?: PGlite };

export type Db = ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzlePglite<typeof schema>>;

function pgliteDir(): string {
  const bundled = path.join(process.cwd(), "data", "pg");
  const writable = (() => { try { fs.accessSync(path.join(process.cwd(), "data"), fs.constants.W_OK); return true; } catch { return false; } })();
  if (writable && !process.env.VERCEL) return bundled;
  const tmp = path.join(process.env.TMPDIR ?? "/tmp", "oborot-pg");
  if (!fs.existsSync(path.join(tmp, "PG_VERSION")) && fs.existsSync(bundled)) {
    fs.mkdirSync(tmp, { recursive: true });
    fs.cpSync(bundled, tmp, { recursive: true });
  }
  return tmp;
}

function create(): Db {
  if (url.startsWith("postgres")) {
    const client = postgres(url, { prepare: false, max: 5, ssl: url.includes("localhost") ? false : "require" });
    return drizzlePg(client, { schema });
  }
  const dir = url.startsWith("file:") ? url.slice(5) : pgliteDir();
  const pg = g.__crmPg ?? new PGlite(dir);
  g.__crmPg = pg;
  return drizzlePglite(pg, { schema });
}

export const db: Db = g.__crmDb ?? create();
if (process.env.NODE_ENV !== "production") g.__crmDb = db;
export const isPglite = !url.startsWith("postgres");
/** Корректно закрыть встроенную базу (важно для скриптов: иначе каталог PGlite может остаться в несогласованном состоянии) */
export async function closeDb() {
  if (g.__crmPg) { await g.__crmPg.close(); g.__crmPg = undefined; g.__crmDb = undefined; }
}
export { schema };
