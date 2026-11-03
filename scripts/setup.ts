import "dotenv/config";
import { migrateDb } from "../src/db/migrate";
import { seedDatabase } from "../src/db/seed";
import { db, schema, closeDb } from "../src/db";
import { count } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

// --fresh: удалить локальную PGlite-базу перед миграциями (лечит повреждённый каталог после аварийного завершения)
if (process.argv.includes("--fresh") && !(process.env.DATABASE_URL ?? "").startsWith("postgres")) fs.rmSync(path.join(process.cwd(), "data", "pg"), { recursive: true, force: true });

/** Миграции + сид (сид только если база пустая или передан --force) */
async function main() {
  await migrateDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.users);
  if (n === 0 || process.argv.includes("--force")) await seedDatabase();
  else console.log(`База уже заполнена (${n} пользователей), сид пропущен. Используйте --force для пересоздания.`);
  await closeDb();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); console.error("\nЕсли база повреждена, выполните: npx tsx scripts/setup.ts --fresh --force"); process.exit(1); });
