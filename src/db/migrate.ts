import path from "node:path";
import { db, isPglite } from "./index";

/** Применяет SQL-миграции из папки drizzle (сгенерированы drizzle-kit generate) */
export async function migrateDb() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (isPglite) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder });
  }
}
