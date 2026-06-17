import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import type { TenantSkillPrompts } from "../src/lib/platform-types";

const ROOT = process.cwd();
const SYSTEM_PROMPT_PATH = join(ROOT, "SYSTEM_PROMPT.md");
const SKILLS_ROOT = join(ROOT, "skills");

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

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return {};

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0) continue;
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadLocalPrompts(): { systemPrompt: string; skillPrompts: TenantSkillPrompts } {
  const systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8").trim();
  if (!systemPrompt) {
    throw new Error(`Missing system prompt at ${SYSTEM_PROMPT_PATH}`);
  }

  const skillPrompts: TenantSkillPrompts = {};
  for (const entry of readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(SKILLS_ROOT, entry.name, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8").trim();
    if (!content) {
      throw new Error(`Skill prompt is empty: ${skillPath}`);
    }

    const frontmatter = parseFrontmatter(content);
    const name = frontmatter.name || entry.name;
    skillPrompts[name] = content;
  }

  if (Object.keys(skillPrompts).length === 0) {
    throw new Error(`No skills found under ${SKILLS_ROOT}`);
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
    console.log(`Skills: ${Object.keys(skillPrompts).sort().join(", ")}`);

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
