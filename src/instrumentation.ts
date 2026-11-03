/** Самовосстановление базы при старте сервера: миграции и демо-данные, если таблиц ещё нет (встроенный PGlite на serverless). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureDatabase } = await import("@/db/ensure");
    await ensureDatabase();
  } catch (e) {
    console.error("[db] ensureDatabase failed:", e);
  }
}
