import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "file:./data/crm.db";
if (url.startsWith("file:")) {
  const p = url.slice(5);
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
}

const globalForDb = globalThis as unknown as { __crmClient?: ReturnType<typeof createClient> };
const client = globalForDb.__crmClient ?? createClient({ url });
if (process.env.NODE_ENV !== "production") globalForDb.__crmClient = client;

export const db = drizzle(client, { schema });
export { schema };
export type Db = typeof db;
