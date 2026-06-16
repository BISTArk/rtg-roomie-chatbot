import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Pool } from "pg";
import type { TenantPromptStage, TenantSkillPrompts } from "../src/lib/platform-types";

const PROMPT_STAGES: TenantPromptStage[] = [
  "returning",
  "greeting",
  "discovery",
  "recommendation",
  "comparison",
  "closing",
  "reengagement",
  "contextual",
  "new-session",
  "interjection",
  "upsell",
  "complaint",
];

const ROOT = process.cwd();
const SYSTEM_PROMPT_PATH = join(ROOT, "SYSTEM_PROMPT.md");
const SKILLS_DIR = join(ROOT, "skills");

type CliOptions = {
  tenantKey: string | null;
  list: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let tenantKey: string | null = null;
  let list = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--tenant-key" || arg === "--tenant") {
      tenantKey = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (arg.startsWith("--tenant-key=")) {
      tenantKey = arg.slice("--tenant-key=".length).trim() || null;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { tenantKey, list, dryRun };
}

function buildPool(connectionString: string): Pool {
  const isLocalhost = connectionString.includes("localhost");
  const ssl =
    process.env.PGSSLMODE === "disable"
      ? false
      : isLocalhost
        ? false
        : { rejectUnauthorized: false };

  return new Pool({
    connectionString,
    max: 1,
    ssl,
  });
}

function loadLocalPrompts(): { systemPrompt: string; skillPrompts: TenantSkillPrompts } {
  const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8").trim();
  if (!systemPrompt) {
    throw new Error(`Missing system prompt at ${SYSTEM_PROMPT_PATH}`);
  }

  const skillPrompts = PROMPT_STAGES.reduce<TenantSkillPrompts>((accumulator, stage) => {
    const skillPath = join(SKILLS_DIR, `${stage}.md`);
    try {
      accumulator[stage] = readFileSync(skillPath, "utf-8").trim();
    } catch {
      throw new Error(`Missing skill prompt file: skills/${stage}.md`);
    }
    if (!accumulator[stage]) {
      throw new Error(`Skill prompt is empty: skills/${stage}.md`);
    }
    return accumulator;
  }, {});

  const extraSkills = readdirSync(SKILLS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => basename(file, ".md"))
    .filter((name) => !PROMPT_STAGES.includes(name as TenantPromptStage));

  if (extraSkills.length > 0) {
    console.warn(
      `Warning: ignoring extra local skill files not in PROMPT_STAGES: ${extraSkills.join(", ")}`
    );
  }

  return { systemPrompt, skillPrompts };
}

async function listTenants(pool: Pool): Promise<void> {
  const result = await pool.query<{ tenant_key: string; name: string; updated_at: string }>(
    `SELECT tenant_key, name, updated_at FROM tenants ORDER BY tenant_key`
  );

  if (result.rows.length === 0) {
    console.log("No tenants found.");
    return;
  }

  console.log("Tenants:\n");
  for (const row of result.rows) {
    console.log(`- ${row.tenant_key} (${row.name}) — updated ${row.updated_at}`);
  }
}

async function pushPrompts(options: CliOptions): Promise<void> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local or .env.");
    process.exit(1);
  }

  const pool = buildPool(connectionString);

  try {
    if (options.list) {
      await listTenants(pool);
      return;
    }

    const { systemPrompt, skillPrompts } = loadLocalPrompts();
    const params: string[] = [];
    let query = `SELECT id, tenant_key, name FROM tenants`;
    if (options.tenantKey) {
      query += ` WHERE tenant_key = $1`;
      params.push(options.tenantKey);
    }
    query += ` ORDER BY tenant_key`;

    const tenants = await pool.query<{ id: string; tenant_key: string; name: string }>(
      query,
      params
    );

    if (tenants.rows.length === 0) {
      console.error(options.tenantKey ? `Tenant not found: ${options.tenantKey}` : "No tenants found.");
      process.exit(1);
    }

    console.log(
      `${options.dryRun ? "Would push" : "Pushing"} local prompts to ${tenants.rows.length} tenant(s)...`
    );
    console.log(`System prompt: ${systemPrompt.length.toLocaleString()} chars`);
    console.log(`Skills: ${PROMPT_STAGES.join(", ")}`);

    for (const tenant of tenants.rows) {
      if (options.dryRun) {
        console.log(`  - ${tenant.tenant_key} (${tenant.name})`);
        continue;
      }

      const result = await pool.query(
        `UPDATE tenants
         SET system_prompt_text = $2,
             skill_prompts_json = $3::jsonb,
             prompts_seeded = TRUE,
             updated_at = NOW()
         WHERE id = $1
         RETURNING tenant_key`,
        [tenant.id, systemPrompt, JSON.stringify(skillPrompts)]
      );

      if ((result.rowCount ?? 0) === 0) {
        console.warn(`  ! failed to update ${tenant.tenant_key}`);
      } else {
        console.log(`  ✓ ${tenant.tenant_key} (${tenant.name})`);
      }
    }

    if (options.dryRun) {
      console.log("\nDry run complete. Re-run without --dry-run to write to the database.");
    } else {
      console.log("\nLocal prompts pushed to the database.");
    }
  } finally {
    await pool.end();
  }
}

const options = parseArgs(process.argv.slice(2));
await pushPrompts(options);
