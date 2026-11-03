import "dotenv/config";
import { seedDatabase } from "../src/db/seed";
import { closeDb } from "../src/db";
seedDatabase().then(() => closeDb()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
