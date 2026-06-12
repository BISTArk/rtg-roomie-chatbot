import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// Supabase session pooler (port 5432) caps shared clients (often 15). On Vercel each
// lambda keeps its own pg.Pool, so a high per-instance max exhausts the pool quickly.
const DEFAULT_MAX_CONNECTIONS = process.env.VERCEL ? 1 : 5;
const POOL_RETRY_ATTEMPTS = 4;
const POOL_RETRY_BASE_MS = 150;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPgPoolExhaustedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("max clients reached") ||
    message.includes("EMAXCONNSESSION") ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "53300")
  );
}

function getPoolMaxConnections(): number {
  const configured = Number(process.env.PG_POOL_MAX);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_MAX_CONNECTIONS;
}

function buildPoolOptions(connectionString: string) {
  const isLocalhost = connectionString.includes("localhost");
  const ssl =
    process.env.PGSSLMODE === "disable"
      ? false
      : isLocalhost
        ? false
        : { rejectUnauthorized: false };

  return {
    connectionString,
    max: getPoolMaxConnections(),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 5_000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 10_000),
    // Release connections when a serverless function goes idle.
    allowExitOnIdle: process.env.VERCEL === "1",
    ssl,
  } satisfies ConstructorParameters<typeof Pool>[0];
}

function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
}

export function hasDatabase(): boolean {
  return getDatabaseUrl() !== null;
}

export function getPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the Postgres platform runtime.");
  }

  if (!pool) {
    pool = new Pool(buildPoolOptions(connectionString));
  }

  return pool;
}

export function isPgDeadlockError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "40P01"
  );
}

async function connectWithRetry(): Promise<PoolClient> {
  let lastError: unknown;

  for (let attempt = 0; attempt < POOL_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await getPool().connect();
    } catch (error) {
      lastError = error;
      if (isPgPoolExhaustedError(error) && attempt < POOL_RETRY_ATTEMPTS - 1) {
        await sleep(POOL_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export async function withDb<T>(
  callback: (client: PoolClient) => Promise<T>,
  options: { retries?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const client = await connectWithRetry();
    try {
      return await callback(client);
    } catch (error) {
      lastError = error;
      if (isPgDeadlockError(error) && attempt < retries - 1) {
        await sleep(50 * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  throw lastError;
}

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < POOL_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await getPool().query<T>(text, params);
    } catch (error) {
      lastError = error;
      if (isPgPoolExhaustedError(error) && attempt < POOL_RETRY_ATTEMPTS - 1) {
        await sleep(POOL_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

export async function ensurePlatformSchema(): Promise<void> {
  if (!hasDatabase()) return;
  if (!schemaReady) {
    schemaReady = withDb(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          tenant_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          storage_namespace TEXT NOT NULL UNIQUE,
          app_name TEXT NOT NULL,
          app_url TEXT NOT NULL,
          theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          prompt_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE tenants
          ADD COLUMN IF NOT EXISTS ai_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE tenants
          ADD COLUMN IF NOT EXISTS system_prompt_text TEXT;

        ALTER TABLE tenants
          ADD COLUMN IF NOT EXISTS skill_prompts_json JSONB NOT NULL DEFAULT '{}'::jsonb;

        ALTER TABLE tenants
          ADD COLUMN IF NOT EXISTS prompts_seeded BOOLEAN NOT NULL DEFAULT FALSE;

        CREATE TABLE IF NOT EXISTS tenant_domains (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          hostname TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, hostname)
        );

        CREATE INDEX IF NOT EXISTS idx_tenant_domains_hostname
          ON tenant_domains(hostname);

        CREATE TABLE IF NOT EXISTS catalog_sources (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          source_type TEXT NOT NULL,
          name TEXT NOT NULL,
          config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_synced_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_catalog_sources_tenant_id
          ON catalog_sources(tenant_id);

        CREATE TABLE IF NOT EXISTS catalog_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          source_id TEXT REFERENCES catalog_sources(id) ON DELETE SET NULL,
          source_type TEXT NOT NULL,
          label TEXT NOT NULL,
          headers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          full_catalog_text TEXT NOT NULL,
          row_count INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          activated_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_catalog_versions_tenant_id
          ON catalog_versions(tenant_id, is_active);

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          session_id TEXT NOT NULL,
          host_origin TEXT,
          last_page_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_tenant_session
          ON conversations(tenant_id, session_id);

        CREATE TABLE IF NOT EXISTS conversation_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL,
          role TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
          ON conversation_messages(conversation_id, sort_order);

        CREATE TABLE IF NOT EXISTS sessions_v2 (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          client_session_id TEXT NOT NULL,
          title TEXT NOT NULL DEFAULT 'New Chat',
          preview_text TEXT NOT NULL DEFAULT '',
          suggestions_json JSONB,
          host_origin TEXT,
          last_page_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, client_session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_v2_tenant_updated
          ON sessions_v2(tenant_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS messages_v2 (
          id TEXT NOT NULL,
          session_id TEXT NOT NULL REFERENCES sessions_v2(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL,
          role TEXT NOT NULL,
          text TEXT NOT NULL,
          parts_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (session_id, id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_v2_session
          ON messages_v2(session_id, sort_order);

        ALTER TABLE messages_v2 DROP CONSTRAINT IF EXISTS messages_v2_pkey;
        ALTER TABLE messages_v2 ADD PRIMARY KEY (session_id, id);

        CREATE TABLE IF NOT EXISTS conversation_analytics (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
          session_id TEXT NOT NULL,
          request_type TEXT NOT NULL,
          conversation_stage TEXT,
          model_key TEXT,
          model_id TEXT,
          provider_id TEXT,
          input_message_count INTEGER NOT NULL DEFAULT 0,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          response_char_count INTEGER NOT NULL DEFAULT 0,
          finish_reason TEXT,
          status TEXT NOT NULL DEFAULT 'completed',
          error_text TEXT,
          host_origin TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_conversation_analytics_tenant_created
          ON conversation_analytics(tenant_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_analytics_session
          ON conversation_analytics(session_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_analytics_conversation
          ON conversation_analytics(conversation_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS visitor_profiles (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          session_id TEXT NOT NULL,
          profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (tenant_id, session_id)
        );

        CREATE INDEX IF NOT EXISTS idx_visitor_profiles_tenant_session
          ON visitor_profiles(tenant_id, session_id);

        CREATE TABLE IF NOT EXISTS share_links (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_share_links_expires_at
          ON share_links(expires_at);

        CREATE TABLE IF NOT EXISTS shopify_installations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
          shop_domain TEXT NOT NULL UNIQUE,
          storefront_domain TEXT,
          access_token TEXT NOT NULL,
          scopes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'installed',
          shop_name TEXT,
          shop_owner TEXT,
          email TEXT,
          currency_code TEXT,
          uninstalled_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_shopify_installations_shop_domain
          ON shopify_installations(shop_domain);

        ALTER TABLE shopify_installations
          ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ;

        ALTER TABLE shopify_installations
          ADD COLUMN IF NOT EXISTS refresh_token TEXT;

        ALTER TABLE shopify_installations
          ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

        ALTER TABLE conversation_analytics
          DROP CONSTRAINT IF EXISTS conversation_analytics_conversation_id_fkey;
      `);
    });
  }

  await schemaReady;
}
