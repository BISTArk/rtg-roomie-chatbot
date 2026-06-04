import { ensurePlatformSchema, hasDatabase } from "../src/lib/db";

if (!hasDatabase()) {
  console.error("DATABASE_URL is not set. Add it to .env.local or .env.");
  process.exit(1);
}

await ensurePlatformSchema();
console.log("Platform schema ensured (sessions_v2, messages_v2, …)");
