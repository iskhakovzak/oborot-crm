import { count } from "drizzle-orm";
import { db, schema } from "./index";
import { migrateDb } from "./migrate";

let ready: Promise<{ ok: boolean; migrated: boolean; seeded: boolean; error?: string }> | null = null;

/** Применяет миграции и сид при пустой базе. Выполняется один раз на процесс. */
export function ensureDatabase() {
  if (!ready) {
    ready = (async () => {
      let migrated = false, seeded = false;
      try {
        await migrateDb();
        migrated = true;
        const [{ n }] = await db.select({ n: count() }).from(schema.users);
        if (n === 0) {
          const { seedDatabase } = await import("./seed");
          await seedDatabase();
          seeded = true;
        }
        return { ok: true, migrated, seeded };
      } catch (e) {
        return { ok: false, migrated, seeded, error: e instanceof Error ? e.message : String(e) };
      }
    })();
  }
  return ready;
}
