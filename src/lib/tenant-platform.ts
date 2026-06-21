import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { DEFAULT_WIDGET_BRANDING, DEFAULT_WIDGET_THEME, SHOP_ASSIST_WIDGET_BRANDING, SHOP_ASSIST_WIDGET_THEME } from "@/lib/widget-config";
import { buildFullCatalogSnapshot } from "@/lib/tenant-catalog";
import { ensurePlatformSchema, hasDatabase, withDb } from "@/lib/db";
import { createTenantToken, normalizeHostname, normalizeOrigin, verifyTenantToken } from "@/lib/platform-security";
import { normalizeShopifyShopDomain } from "@/lib/shopify";
import type {
  CatalogDataset,
  CatalogSourceRecord,
  CatalogSourceType,
  CatalogVersionRecord,
  SessionHistoryItem,
  SessionState,
  ShopifyInstallationRecord,
  ShopifyInstallStatus,
  TenantAnalyticsFilters,
  TenantAnalyticsSummary,
  TenantBootstrap,
  TenantPromptConfig,
  TenantRecord,
  TenantRuntimeConfig,
  TenantSkillPrompts,
  TenantSessionAnalyticsFilters,
  TenantSessionAnalyticsPage,
  TenantSessionAnalyticsRecord,
} from "@/lib/platform-types";
import type { PersistedChatMessage, SharedChatMessage } from "@/lib/chat-types";
import type { VisitorProfile } from "@/lib/visitor-profile";
import { formatRetrievedCatalog, queryFullCatalog } from "@/lib/catalog-retrieval";
import { SKILLS_RAW } from "@/data/skills-raw";
import { getDefaultSkillRegistry } from "@/lib/skills";
import { getDefaultSystemPrompt } from "@/lib/system-prompt";
import {
  deleteAiSdkSessionHistory,
  ensureSessionRecord,
  listAiSdkSessionHistory,
  loadAiSdkSessionState,
  saveAiSdkSessionState,
} from "@/lib/ai-sdk-sessions";
import { getWhatsAppLinkBySession } from "@/lib/whatsapp-links";
import {
  getTwilioWhatsAppConfigStatus,
  isTwilioWhatsAppConfigured,
} from "@/lib/twilio-whatsapp";

const DEFAULT_TENANT_KEY = "shop-assist-demo";
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SEEDED_SYSTEM_PROMPT = getDefaultSystemPrompt();
const DEFAULT_SEEDED_SKILL_PROMPTS = getDefaultSkillRegistry().reduce<TenantSkillPrompts>(
  (accumulator, skill) => {
    accumulator[skill.name] = SKILLS_RAW[skill.name] || "";
    return accumulator;
  },
  {}
);

const FALLBACK_TENANT: TenantRecord = {
  tenantId: "tenant_local_shop_assist",
  tenantKey: DEFAULT_TENANT_KEY,
  name: "Shop Assist Demo",
  storageNamespace: "shop-assist-demo",
  appName: "Shop Assist",
  appUrl: "https://example.com",
  theme: SHOP_ASSIST_WIDGET_THEME,
  branding: SHOP_ASSIST_WIDGET_BRANDING,
  prompt: {
    brandName: "Demo Store",
    websiteUrl: "https://example.com",
    supportUrl: "https://example.com/support",
    storeLocatorUrl: "https://example.com/stores",
    handoffDescription: "support team",
  },
  systemPrompt: DEFAULT_SEEDED_SYSTEM_PROMPT,
  skillPrompts: DEFAULT_SEEDED_SKILL_PROMPTS,
  allowedDomains: ["localhost", "127.0.0.1"],
  shopifyInstallation: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

interface TenantRow {
  id: string;
  tenant_key: string;
  name: string;
  storage_namespace: string;
  app_name: string;
  app_url: string;
  theme_json: Partial<typeof DEFAULT_WIDGET_THEME>;
  branding_json: Partial<typeof DEFAULT_WIDGET_BRANDING>;
  prompt_json: Record<string, unknown>;
  system_prompt_text: string | null;
  skill_prompts_json: TenantSkillPrompts;
  prompts_seeded?: boolean;
  created_at: string;
  updated_at: string;
}

interface ShopifyInstallationRow {
  id: string;
  tenant_id: string;
  shop_domain: string;
  storefront_domain: string | null;
  access_token: string;
  access_token_expires_at: string | null;
  refresh_token: string | null;
  refresh_token_expires_at: string | null;
  scopes_json: string[];
  status: ShopifyInstallStatus;
  shop_name: string | null;
  shop_owner: string | null;
  email: string | null;
  currency_code: string | null;
  uninstalled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationAnalyticsSummaryRow {
  tenant_id: string;
  tenant_key: string;
  tenant_name: string;
  session_count: string | number;
  message_count: string | number;
  user_message_count: string | number;
  assistant_message_count: string | number;
  request_count: string | number;
  prompt_tokens: string | number;
  completion_tokens: string | number;
  total_tokens: string | number;
  error_count: string | number;
  engaged_session_count: string | number;
  last_active_at: string | null;
}

interface ConversationAnalyticsSessionRow {
  tenant_id: string;
  tenant_key: string;
  tenant_name: string;
  session_id: string;
  host_origin: string | null;
  created_at: string;
  updated_at: string;
  last_request_at: string | null;
  message_count: string | number;
  user_message_count: string | number;
  assistant_message_count: string | number;
  request_count: string | number;
  prompt_tokens: string | number;
  completion_tokens: string | number;
  total_tokens: string | number;
  error_count: string | number;
  total_count?: string | number;
}

interface ConversationAnalyticsSessionExportRow extends ConversationAnalyticsSessionRow {
  transcript: string | null;
}

function asCount(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapTenantAnalyticsSummary(row: ConversationAnalyticsSummaryRow): TenantAnalyticsSummary {
  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    tenantName: row.tenant_name,
    sessionCount: asCount(row.session_count),
    messageCount: asCount(row.message_count),
    userMessageCount: asCount(row.user_message_count),
    assistantMessageCount: asCount(row.assistant_message_count),
    requestCount: asCount(row.request_count),
    promptTokens: asCount(row.prompt_tokens),
    completionTokens: asCount(row.completion_tokens),
    totalTokens: asCount(row.total_tokens),
    errorCount: asCount(row.error_count),
    engagedSessionCount: asCount(row.engaged_session_count),
    lastActiveAt: row.last_active_at,
  };
}

function mapTenantSessionAnalytics(row: ConversationAnalyticsSessionRow): TenantSessionAnalyticsRecord {
  return {
    tenantId: row.tenant_id,
    tenantKey: row.tenant_key,
    tenantName: row.tenant_name,
    sessionId: row.session_id,
    hostOrigin: row.host_origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRequestAt: row.last_request_at,
    messageCount: asCount(row.message_count),
    userMessageCount: asCount(row.user_message_count),
    assistantMessageCount: asCount(row.assistant_message_count),
    requestCount: asCount(row.request_count),
    promptTokens: asCount(row.prompt_tokens),
    completionTokens: asCount(row.completion_tokens),
    totalTokens: asCount(row.total_tokens),
    errorCount: asCount(row.error_count),
  };
}

function normalizeTextArray(values: string[] | null | undefined): string[] {
  return [...new Set((values ?? []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeDateStart(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const normalized = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString();
}

function normalizeDateEndExclusive(value: string | null | undefined): string | null {
  const start = normalizeDateStart(value);
  if (!start) return null;
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function appendTenantAndDateFilters(input: {
  filters?: TenantAnalyticsFilters;
  tenantColumn: string;
  timestampColumn: string;
  conditions: string[];
  params: unknown[];
}): void {
  const tenantIds = normalizeTextArray(input.filters?.tenantIds);
  const excludedTenantIds = normalizeTextArray(input.filters?.excludedTenantIds);
  const fromDate = normalizeDateStart(input.filters?.fromDate);
  const toDateExclusive = normalizeDateEndExclusive(input.filters?.toDate);

  if (tenantIds.length > 0) {
    input.params.push(tenantIds);
    input.conditions.push(`${input.tenantColumn} = ANY($${input.params.length}::text[])`);
  }

  if (excludedTenantIds.length > 0) {
    input.params.push(excludedTenantIds);
    input.conditions.push(`NOT (${input.tenantColumn} = ANY($${input.params.length}::text[]))`);
  }

  if (fromDate) {
    input.params.push(fromDate);
    input.conditions.push(`${input.timestampColumn} >= $${input.params.length}::timestamptz`);
  }

  if (toDateExclusive) {
    input.params.push(toDateExclusive);
    input.conditions.push(`${input.timestampColumn} < $${input.params.length}::timestamptz`);
  }
}

function buildSeededSkillPrompts(skillPrompts?: TenantSkillPrompts | null): TenantSkillPrompts {
  const current = skillPrompts ?? {};
  return getDefaultSkillRegistry().reduce<TenantSkillPrompts>((accumulator, skill) => {
    const value = current[skill.name];
    accumulator[skill.name] =
      typeof value === "string" && value.trim()
        ? value.trim()
        : DEFAULT_SEEDED_SKILL_PROMPTS[skill.name] || "";
    return accumulator;
  }, {});
}

async function seedTenantPromptDefaults(client: PoolClient): Promise<void> {
  const result = await client.query<{
    id: string;
    system_prompt_text: string | null;
    skill_prompts_json: TenantSkillPrompts | null;
  }>(
    `SELECT id, system_prompt_text, skill_prompts_json
     FROM tenants
     WHERE COALESCE(prompts_seeded, FALSE) = FALSE`
  );

  for (const row of result.rows) {
    await client.query(
      `UPDATE tenants
       SET system_prompt_text = $2,
           skill_prompts_json = $3::jsonb,
           prompts_seeded = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [
        row.id,
        row.system_prompt_text?.trim() || DEFAULT_SEEDED_SYSTEM_PROMPT,
        JSON.stringify(buildSeededSkillPrompts(row.skill_prompts_json)),
      ]
    );
  }
}

function mapShopifyInstallationRow(row: ShopifyInstallationRow): ShopifyInstallationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    shopDomain: row.shop_domain,
    storefrontDomain: row.storefront_domain,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    scopes: Array.isArray(row.scopes_json) ? row.scopes_json : [],
    status: row.status,
    shopName: row.shop_name,
    shopOwner: row.shop_owner,
    email: row.email,
    currencyCode: row.currency_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    uninstalledAt: row.uninstalled_at,
  };
}

function deriveTenantKey(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\.myshopify\.com$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "shopify-tenant";
}

function mapTenantRow(
  row: TenantRow,
  allowedDomains: string[],
  shopifyInstallation?: ShopifyInstallationRecord | null
): TenantRecord {
  const prompt = {
    brandName: row.name,
    ...(row.prompt_json ?? {}),
  } as TenantPromptConfig;

  return {
    tenantId: row.id,
    tenantKey: row.tenant_key,
    name: row.name,
    storageNamespace: row.storage_namespace,
    appName: row.app_name,
    appUrl: row.app_url,
    theme: row.theme_json ?? {},
    branding: row.branding_json ?? {},
    prompt,
    systemPrompt: row.system_prompt_text,
    skillPrompts: row.skill_prompts_json ?? {},
    allowedDomains,
    shopifyInstallation: shopifyInstallation ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadShopifyInstallation(
  client: PoolClient,
  tenantId: string
): Promise<ShopifyInstallationRecord | null> {
  const result = await client.query<ShopifyInstallationRow>(
    `SELECT * FROM shopify_installations WHERE tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] ? mapShopifyInstallationRow(result.rows[0]) : null;
}

async function upsertShopifyCatalogSource(client: PoolClient, tenantId: string, shopDomain: string): Promise<void> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM catalog_sources WHERE tenant_id = $1 AND source_type = 'shopify' LIMIT 1`,
    [tenantId]
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `UPDATE catalog_sources
       SET name = $2,
           config_json = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, "Shopify catalog", JSON.stringify({ shopDomain })]
    );
    return;
  }

  await client.query(
    `INSERT INTO catalog_sources (id, tenant_id, source_type, name, config_json)
     VALUES ($1, $2, 'shopify', $3, $4::jsonb)`,
    [randomUUID(), tenantId, "Shopify catalog", JSON.stringify({ shopDomain })]
  );
}

async function ensureUniqueTenantKey(
  client: PoolClient,
  proposedTenantKey: string,
  excludeTenantId?: string
): Promise<string> {
  const baseKey = deriveTenantKey(proposedTenantKey);
  let candidate = baseKey;
  let suffix = 2;

  while (true) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE tenant_key = $1 LIMIT 1`,
      [candidate]
    );
    if (result.rows.length === 0 || result.rows[0].id === excludeTenantId) {
      return candidate;
    }
    candidate = `${baseKey}-${suffix}`;
    suffix += 1;
  }
}

function emptyProfile(): VisitorProfile {
  const today = new Date().toISOString().split("T")[0];
  return {
    visitCount: 0,
    firstVisit: today,
    lastVisit: today,
    viewedProducts: [],
    viewedCategories: [],
    purchasedProducts: [],
    lastConversationStage: "",
    preferences: {},
  };
}

function sanitizeMessages(messages: PersistedChatMessage[] | null | undefined): PersistedChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (message): message is PersistedChatMessage =>
        typeof message === "object" &&
        message !== null &&
        typeof message.id === "string" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.text === "string"
    )
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      ...(Array.isArray(message.parts) && message.parts.length > 0
        ? { parts: message.parts }
        : {}),
    }))
    .slice(-100);
}

function sanitizeSharedMessages(messages: SharedChatMessage[] | null | undefined): SharedChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (message): message is SharedChatMessage =>
        typeof message === "object" &&
        message !== null &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.text === "string"
    )
    .slice(-100);
}

function sanitizeProfile(input: VisitorProfile | null | undefined): VisitorProfile | null {
  if (!input || typeof input !== "object") return null;
  const base = emptyProfile();
  return {
    ...base,
    ...input,
    viewedProducts: Array.isArray(input.viewedProducts) ? input.viewedProducts.slice(-20) : [],
    viewedCategories: Array.isArray(input.viewedCategories) ? input.viewedCategories.slice(-10) : [],
    purchasedProducts: Array.isArray(input.purchasedProducts) ? input.purchasedProducts.slice(-20) : [],
    preferences:
      input.preferences && typeof input.preferences === "object"
        ? Object.fromEntries(
            Object.entries(input.preferences)
              .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
              .slice(0, 20)
          )
        : {},
  };
}

function buildStorageNamespace(tenantKey: string): string {
  return tenantKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

let defaultTenantSeedReady: Promise<void> | null = null;

async function runDefaultTenantSeed(): Promise<void> {
  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('seed-default-tenant'))`);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE tenant_key = $1 LIMIT 1`,
        [DEFAULT_TENANT_KEY]
      );
      if (existing.rows.length === 0) {
        const tenantId = randomUUID();
        await client.query(
          `INSERT INTO tenants (
          id, tenant_key, name, storage_namespace, app_name, app_url, theme_json, branding_json, prompt_json, system_prompt_text, skill_prompts_json, prompts_seeded
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)
        ON CONFLICT (tenant_key) DO NOTHING`,
          [
            tenantId,
            DEFAULT_TENANT_KEY,
            FALLBACK_TENANT.name,
            FALLBACK_TENANT.storageNamespace,
            FALLBACK_TENANT.appName,
            FALLBACK_TENANT.appUrl,
            JSON.stringify(FALLBACK_TENANT.theme),
            JSON.stringify(FALLBACK_TENANT.branding),
            JSON.stringify(FALLBACK_TENANT.prompt),
            DEFAULT_SEEDED_SYSTEM_PROMPT,
            JSON.stringify(DEFAULT_SEEDED_SKILL_PROMPTS),
            true,
          ]
        );

        const seededTenant = await client.query<{ id: string }>(
          `SELECT id FROM tenants WHERE tenant_key = $1 LIMIT 1`,
          [DEFAULT_TENANT_KEY]
        );
        const seededTenantId = seededTenant.rows[0]?.id;
        if (!seededTenantId) {
          await client.query("COMMIT");
          return;
        }

        for (const hostname of FALLBACK_TENANT.allowedDomains) {
          await client.query(
            `INSERT INTO tenant_domains (id, tenant_id, hostname) VALUES ($1, $2, $3)
             ON CONFLICT (tenant_id, hostname) DO NOTHING`,
            [randomUUID(), seededTenantId, hostname]
          );
        }

        const fullExecution = await queryFullCatalog();
        const headers = fullExecution.rows.length > 0 ? Object.keys(fullExecution.rows[0]) : [];
        const rows = fullExecution.rows.map((row: Record<string, string | number | null>) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value == null ? "" : String(value)])
          )
        );
        const dataset: CatalogDataset = {
          headers,
          rows,
          fullCatalogText: formatRetrievedCatalog(fullExecution, {
            intent: {
              mode: "product_search",
              intent_summary: "Default seeded full catalog snapshot.",
              category: null,
              product_names: [],
              brands: [],
              mattress_sizes: [],
              mattress_types: [],
              sleep_positions: [],
              support_levels: [],
              temperature_management: [],
              comfort: [],
              discount_only: false,
              price_min: null,
              price_max: null,
              sort: "relevance",
              limit: rows.length,
            },
          }),
        };
        await insertCatalogVersion(client, {
          tenantId: seededTenantId,
          sourceId: null,
          sourceType: "excel",
          label: "Seeded RTG catalog",
          dataset,
          activate: true,
        });
      }

      await seedTenantPromptDefaults(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function ensureDefaultTenantSeeded(): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();
  if (!defaultTenantSeedReady) {
    defaultTenantSeedReady = runDefaultTenantSeed().catch((error) => {
      defaultTenantSeedReady = null;
      throw error;
    });
  }
  await defaultTenantSeedReady;
}

async function seedDefaultTenant(): Promise<void> {
  await ensureDefaultTenantSeeded();
}

async function loadTenantDomains(client: PoolClient, tenantId: string): Promise<string[]> {
  const result = await client.query<{ hostname: string }>(
    `SELECT hostname FROM tenant_domains WHERE tenant_id = $1 ORDER BY hostname ASC`,
    [tenantId]
  );
  return result.rows.map((row) => row.hostname);
}

async function findPreferredTenantIdByDomains(
  client: PoolClient,
  hostnames: Array<string | null | undefined>
): Promise<string> {
  const normalizedHostnames = [...new Set(
    hostnames
      .map((hostname) => String(hostname || "").trim().toLowerCase())
      .filter(Boolean)
  )];

  if (normalizedHostnames.length === 0) {
    return "";
  }

  const result = await client.query<{ tenant_id: string }>(
    `SELECT d.tenant_id
     FROM tenant_domains d
     INNER JOIN tenants t ON t.id = d.tenant_id
     LEFT JOIN shopify_installations si ON si.tenant_id = t.id
     LEFT JOIN catalog_versions cv ON cv.tenant_id = t.id AND cv.is_active = TRUE
     WHERE d.hostname = ANY($1::text[])
     GROUP BY d.tenant_id
     ORDER BY
       COALESCE(BOOL_OR(si.status = 'installed'), FALSE) DESC,
       COALESCE(BOOL_OR(cv.is_active = TRUE), FALSE) DESC,
       MAX(t.updated_at) DESC,
       d.tenant_id ASC
     LIMIT 1`,
    [normalizedHostnames]
  );

  return result.rows[0]?.tenant_id || "";
}

function hostAllowed(hostname: string, allowedDomains: string[]): boolean {
  if (!hostname) return false;
  const normalizedHostname = hostname.toLowerCase();
  const hostnameWithoutWww = normalizedHostname.replace(/^www\./, "");

  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase();
    const normalizedWithoutWww = normalized.replace(/^www\./, "");

    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(2);
      const hostnameSuffix = normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`);
      const hostnameWithoutWwwSuffix =
        hostnameWithoutWww === suffix || hostnameWithoutWww.endsWith(`.${suffix}`);
      return hostnameSuffix || hostnameWithoutWwwSuffix;
    }

    return (
      normalizedHostname === normalized ||
      hostnameWithoutWww === normalizedWithoutWww
    );
  });
}

function buildOriginFromHostname(hostname: string): string {
  const normalizedHostname = String(hostname || "").trim().toLowerCase();
  if (!normalizedHostname || normalizedHostname.startsWith("*.")) return "";
  const useHttp =
    normalizedHostname === "localhost" ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalizedHostname);
  return `${useHttp ? "http" : "https"}://${normalizedHostname}`;
}

function resolveTenantTokenHostOrigin(
  tenant: Pick<TenantRecord, "allowedDomains" | "appUrl">,
  requestedHostOrigin?: string | null
): string {
  const requestedOrigin = normalizeOrigin(requestedHostOrigin);
  const requestedHostname = normalizeHostname(requestedOrigin);

  if (
    requestedOrigin &&
    requestedHostname &&
    (
      tenant.allowedDomains.length === 0 ||
      hostAllowed(requestedHostname, tenant.allowedDomains)
    )
  ) {
    return requestedOrigin;
  }

  const appOrigin = normalizeOrigin(tenant.appUrl);
  const appHostname = normalizeHostname(appOrigin);
  if (
    appOrigin &&
    appHostname &&
    (
      tenant.allowedDomains.length === 0 ||
      hostAllowed(appHostname, tenant.allowedDomains)
    )
  ) {
    return appOrigin;
  }

  for (const domain of tenant.allowedDomains) {
    const allowedOrigin = normalizeOrigin(buildOriginFromHostname(domain));
    if (allowedOrigin) {
      return allowedOrigin;
    }
  }

  return requestedOrigin || appOrigin || tenant.appUrl;
}

export async function resolveTenant(
  tenantKey: string | null | undefined,
  hostOrigin?: string | null,
  options?: {
    skipHostValidation?: boolean;
  }
): Promise<TenantRecord> {
  const normalizedKey = String(tenantKey || DEFAULT_TENANT_KEY).trim() || DEFAULT_TENANT_KEY;
  const origin = normalizeOrigin(hostOrigin);
  const hostname = normalizeHostname(origin);
  const skipHostValidation = options?.skipHostValidation === true;

  if (!hasDatabase()) {
    if (
      !skipHostValidation &&
      hostname &&
      !hostAllowed(hostname, FALLBACK_TENANT.allowedDomains) &&
      hostname !== normalizeHostname(FALLBACK_TENANT.appUrl)
    ) {
      throw new Error(`Tenant "${normalizedKey}" is not allowed for host "${hostname}".`);
    }
    return {
      ...FALLBACK_TENANT,
      tenantKey: normalizedKey,
      storageNamespace: buildStorageNamespace(normalizedKey),
    };
  }

  await ensurePlatformSchema();
  if (normalizedKey === DEFAULT_TENANT_KEY) {
    await ensureDefaultTenantSeeded();
  }
  return withDb(async (client) => {
    const result = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE tenant_key = $1 LIMIT 1`,
      [normalizedKey]
    );
    if (result.rows.length === 0) {
      throw new Error(`Unknown tenant key "${normalizedKey}".`);
    }

    const row = result.rows[0];
    const allowedDomains = await loadTenantDomains(client, row.id);
    if (
      !skipHostValidation &&
      hostname &&
      allowedDomains.length > 0 &&
      !hostAllowed(hostname, allowedDomains)
    ) {
      throw new Error(`Tenant "${normalizedKey}" is not allowed for host "${hostname}".`);
    }

    return mapTenantRow(row, allowedDomains, await loadShopifyInstallation(client, row.id));
  });
}

export async function resolveTenantByDomain(
  hostname: string | null | undefined
): Promise<TenantRecord | null> {
  const normalizedHostname = String(hostname || "").trim().toLowerCase();
  if (!normalizedHostname) return null;

  if (!hasDatabase()) {
    return FALLBACK_TENANT.allowedDomains.includes(normalizedHostname)
      ? FALLBACK_TENANT
      : null;
  }

  await ensurePlatformSchema();
  return withDb(async (client) => {
    const tenantId = await findPreferredTenantIdByDomains(client, [normalizedHostname]);
    if (!tenantId) return null;

    const result = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return mapTenantRow(
      row,
      await loadTenantDomains(client, row.id),
      await loadShopifyInstallation(client, row.id)
    );
  });
}

export async function getPublicWidgetConfigByDomain(
  hostname: string | null | undefined
): Promise<Pick<TenantRuntimeConfig, "tenantKey" | "theme" | "branding"> | null> {
  const tenant = await resolveTenantByDomain(hostname);
  if (!tenant) return null;
  return {
    tenantKey: tenant.tenantKey,
    theme: tenant.theme,
    branding: tenant.branding,
  };
}

export async function loadSessionState(
  tenantId: string,
  sessionId: string
): Promise<SessionState> {
  return loadAiSdkSessionState(tenantId, sessionId);
}

export async function saveSessionState(input: {
  tenantId: string;
  sessionId: string;
  hostOrigin?: string | null;
  lastPageUrl?: string | null;
  messages: PersistedChatMessage[];
  visitorProfile?: VisitorProfile | null;
  suggestions?: string[] | null;
}): Promise<void> {
  if (!hasDatabase()) return;

  const sanitizedMessages = sanitizeMessages(input.messages);
  const sanitizedProfile = sanitizeProfile(input.visitorProfile);

  await saveAiSdkSessionState({
    ...input,
    messages: sanitizedMessages,
    visitorProfile: sanitizedProfile,
    suggestions: input.suggestions,
  });
}

export async function listSessionHistory(
  tenantId: string,
  limit = 20
): Promise<SessionHistoryItem[]> {
  return listAiSdkSessionHistory(tenantId, limit);
}

export async function deleteSessionHistory(input: {
  tenantId: string;
  sessionId: string;
}): Promise<void> {
  return deleteAiSdkSessionHistory(input);
}

export async function recordConversationAnalytics(input: {
  tenantId: string;
  sessionId: string;
  requestType: string;
  conversationStage?: string | null;
  modelKey?: string | null;
  modelId?: string | null;
  providerId?: string | null;
  inputMessageCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  responseCharCount?: number;
  finishReason?: string | null;
  status?: string | null;
  errorText?: string | null;
  hostOrigin?: string | null;
}): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();

  await withDb(async (client) => {
    const sessionRowId = await ensureSessionRecord(client, {
      tenantId: input.tenantId,
      clientSessionId: input.sessionId,
      hostOrigin: normalizeOrigin(input.hostOrigin),
    });

    await client.query(
      `INSERT INTO conversation_analytics (
        id,
        tenant_id,
        conversation_id,
        session_id,
        request_type,
        conversation_stage,
        model_key,
        model_id,
        provider_id,
        input_message_count,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        response_char_count,
        finish_reason,
        status,
        error_text,
        host_origin
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )`,
      [
        randomUUID(),
        input.tenantId,
        sessionRowId,
        input.sessionId,
        input.requestType.trim(),
        input.conversationStage?.trim() || null,
        input.modelKey?.trim() || null,
        input.modelId?.trim() || null,
        input.providerId?.trim() || null,
        Math.max(0, Math.round(input.inputMessageCount || 0)),
        Math.max(0, Math.round(input.promptTokens || 0)),
        Math.max(0, Math.round(input.completionTokens || 0)),
        Math.max(0, Math.round(input.totalTokens || 0)),
        Math.max(0, Math.round(input.responseCharCount || 0)),
        input.finishReason?.trim() || null,
        input.status?.trim() || "completed",
        input.errorText?.trim() || null,
        normalizeOrigin(input.hostOrigin),
      ]
    );
  });
}

export async function listTenantAnalyticsSummaries(
  filters: TenantAnalyticsFilters = {}
): Promise<TenantAnalyticsSummary[]> {
  if (!hasDatabase()) return [];
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const params: unknown[] = [];
    const messageConditions = ["1=1"];
    const analyticsConditions = ["1=1"];

    appendTenantAndDateFilters({
      filters,
      tenantColumn: "s.tenant_id",
      timestampColumn: "s.updated_at",
      conditions: messageConditions,
      params,
    });

    appendTenantAndDateFilters({
      filters,
      tenantColumn: "ca.tenant_id",
      timestampColumn: "ca.created_at",
      conditions: analyticsConditions,
      params,
    });

    const result = await client.query<ConversationAnalyticsSummaryRow>(
      `WITH message_stats AS (
         SELECT
           s.tenant_id,
           COUNT(DISTINCT s.client_session_id) AS session_count,
           COUNT(m.id) AS message_count,
           COUNT(*) FILTER (WHERE m.role = 'user') AS user_message_count,
           COUNT(*) FILTER (WHERE m.role = 'assistant') AS assistant_message_count,
           MAX(s.updated_at) AS last_conversation_at
         FROM sessions_v2 s
         LEFT JOIN messages_v2 m ON m.session_id = s.id
         WHERE ${messageConditions.join(" AND ")}
         GROUP BY s.tenant_id
       ),
       session_engagement AS (
         SELECT
           s.tenant_id,
           COUNT(DISTINCT CASE WHEN user_msg_count > 2 THEN s.client_session_id END) AS engaged_session_count
         FROM sessions_v2 s
         INNER JOIN (
           SELECT session_id, COUNT(*) FILTER (WHERE role = 'user') AS user_msg_count
           FROM messages_v2
           GROUP BY session_id
         ) m ON m.session_id = s.id
         WHERE ${messageConditions.join(" AND ")}
         GROUP BY s.tenant_id
       ),
       analytics_stats AS (
         SELECT
           tenant_id,
           COUNT(*) AS request_count,
           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COUNT(*) FILTER (WHERE status <> 'completed') AS error_count,
           MAX(created_at) AS last_request_at
         FROM conversation_analytics ca
         WHERE ${analyticsConditions.join(" AND ")}
         GROUP BY tenant_id
       )
       SELECT
         t.id AS tenant_id,
         t.tenant_key,
         t.name AS tenant_name,
         COALESCE(ms.session_count, 0) AS session_count,
         COALESCE(ms.message_count, 0) AS message_count,
         COALESCE(ms.user_message_count, 0) AS user_message_count,
         COALESCE(ms.assistant_message_count, 0) AS assistant_message_count,
         COALESCE(ast.request_count, 0) AS request_count,
         COALESCE(ast.prompt_tokens, 0) AS prompt_tokens,
         COALESCE(ast.completion_tokens, 0) AS completion_tokens,
         COALESCE(ast.total_tokens, 0) AS total_tokens,
         COALESCE(ast.error_count, 0) AS error_count,
         COALESCE(se.engaged_session_count, 0) AS engaged_session_count,
         COALESCE(GREATEST(ms.last_conversation_at, ast.last_request_at), ms.last_conversation_at, ast.last_request_at) AS last_active_at
       FROM tenants t
       LEFT JOIN message_stats ms ON ms.tenant_id = t.id
       LEFT JOIN session_engagement se ON se.tenant_id = t.id
       LEFT JOIN analytics_stats ast ON ast.tenant_id = t.id
       ORDER BY COALESCE(ast.total_tokens, 0) DESC, t.created_at ASC`,
      params
    );

    return result.rows.map(mapTenantAnalyticsSummary);
  });
}

export async function listRecentTenantSessionAnalytics(limit = 50): Promise<TenantSessionAnalyticsRecord[]> {
  const page = await listTenantSessionAnalyticsPage({ limit, offset: 0 });
  return page.records;
}

export async function listTenantSessionAnalyticsExportRecords(
  filters: TenantSessionAnalyticsFilters = {}
): Promise<Array<TenantSessionAnalyticsRecord & { transcript: string }>> {
  if (!hasDatabase()) {
    return [];
  }

  await ensurePlatformSchema();
  return withDb(async (client) => {
    const params: unknown[] = [];
    const conditions = ["1=1"];
    const tenantIds = normalizeTextArray(filters.tenantIds);
    const excludedTenantIds = normalizeTextArray(filters.excludedTenantIds);
    const fromDate = normalizeDateStart(filters.fromDate);
    const toDateExclusive = normalizeDateEndExclusive(filters.toDate);
    const searchText = String(filters.query || "").trim();

    if (tenantIds.length > 0) {
      params.push(tenantIds);
      conditions.push(`s.tenant_id = ANY($${params.length}::text[])`);
    }

    if (excludedTenantIds.length > 0) {
      params.push(excludedTenantIds);
      conditions.push(`NOT (s.tenant_id = ANY($${params.length}::text[]))`);
    }

    if (fromDate) {
      params.push(fromDate);
      conditions.push(`COALESCE(ast.last_request_at, s.updated_at) >= $${params.length}::timestamptz`);
    }

    if (toDateExclusive) {
      params.push(toDateExclusive);
      conditions.push(`COALESCE(ast.last_request_at, s.updated_at) < $${params.length}::timestamptz`);
    }

    if (searchText) {
      params.push(`%${searchText}%`);
      conditions.push(`(
        s.client_session_id ILIKE $${params.length}
        OR COALESCE(s.host_origin, '') ILIKE $${params.length}
        OR t.name ILIKE $${params.length}
        OR t.tenant_key ILIKE $${params.length}
      )`);
    }

    if (filters.errorsOnly) {
      conditions.push("COALESCE(ast.error_count, 0) > 0");
    }

    if (filters.engagedOnly) {
      conditions.push("COALESCE(ms.user_message_count, 0) > 2");
    }

    const result = await client.query<ConversationAnalyticsSessionExportRow>(
      `WITH message_stats AS (
         SELECT
           s.id AS session_row_id,
           COUNT(m.id) AS message_count,
           COUNT(*) FILTER (WHERE m.role = 'user') AS user_message_count,
           COUNT(*) FILTER (WHERE m.role = 'assistant') AS assistant_message_count
         FROM sessions_v2 s
         LEFT JOIN messages_v2 m ON m.session_id = s.id
         GROUP BY s.id
       ),
       analytics_stats AS (
         SELECT
           tenant_id,
           session_id,
           COUNT(*) AS request_count,
           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COUNT(*) FILTER (WHERE status <> 'completed') AS error_count,
           MAX(created_at) AS last_request_at
         FROM conversation_analytics
         GROUP BY tenant_id, session_id
       ),
       transcripts AS (
         SELECT
           session_id,
           STRING_AGG(
             CONCAT(UPPER(role), ': ', text),
             E'\n\n'
             ORDER BY sort_order ASC
           ) AS transcript
         FROM messages_v2
         GROUP BY session_id
       )
       SELECT
         t.id AS tenant_id,
         t.tenant_key,
         t.name AS tenant_name,
         s.client_session_id AS session_id,
         s.host_origin,
         s.created_at,
         s.updated_at,
         ast.last_request_at,
         COALESCE(ms.message_count, 0) AS message_count,
         COALESCE(ms.user_message_count, 0) AS user_message_count,
         COALESCE(ms.assistant_message_count, 0) AS assistant_message_count,
         COALESCE(ast.request_count, 0) AS request_count,
         COALESCE(ast.prompt_tokens, 0) AS prompt_tokens,
         COALESCE(ast.completion_tokens, 0) AS completion_tokens,
         COALESCE(ast.total_tokens, 0) AS total_tokens,
         COALESCE(ast.error_count, 0) AS error_count,
         tr.transcript
       FROM sessions_v2 s
       INNER JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN message_stats ms ON ms.session_row_id = s.id
       LEFT JOIN analytics_stats ast ON ast.tenant_id = s.tenant_id AND ast.session_id = s.client_session_id
       LEFT JOIN transcripts tr ON tr.session_id = s.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY COALESCE(ast.last_request_at, s.updated_at) DESC, s.updated_at DESC`,
      params
    );

    return result.rows.map((row) => ({
      ...mapTenantSessionAnalytics(row),
      transcript: row.transcript || "",
    }));
  });
}

export async function listTenantSessionAnalyticsPage(
  filters: TenantSessionAnalyticsFilters = {}
): Promise<TenantSessionAnalyticsPage> {
  if (!hasDatabase()) {
    return {
      records: [],
      totalCount: 0,
      limit: Math.min(100, Math.max(10, Math.floor(filters.limit || 25))),
      offset: Math.max(0, Math.floor(filters.offset || 0)),
    };
  }
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const params: unknown[] = [];
    const conditions = ["1=1"];
    const normalizedLimit = Math.min(100, Math.max(10, Math.floor(filters.limit || 25)));
    const normalizedOffset = Math.max(0, Math.floor(filters.offset || 0));
    const tenantIds = normalizeTextArray(filters.tenantIds);
    const excludedTenantIds = normalizeTextArray(filters.excludedTenantIds);
    const fromDate = normalizeDateStart(filters.fromDate);
    const toDateExclusive = normalizeDateEndExclusive(filters.toDate);
    const searchText = String(filters.query || "").trim();

    if (tenantIds.length > 0) {
      params.push(tenantIds);
      conditions.push(`s.tenant_id = ANY($${params.length}::text[])`);
    }

    if (excludedTenantIds.length > 0) {
      params.push(excludedTenantIds);
      conditions.push(`NOT (s.tenant_id = ANY($${params.length}::text[]))`);
    }

    if (fromDate) {
      params.push(fromDate);
      conditions.push(`COALESCE(ast.last_request_at, s.updated_at) >= $${params.length}::timestamptz`);
    }

    if (toDateExclusive) {
      params.push(toDateExclusive);
      conditions.push(`COALESCE(ast.last_request_at, s.updated_at) < $${params.length}::timestamptz`);
    }

    if (searchText) {
      params.push(`%${searchText}%`);
      conditions.push(`(
        s.client_session_id ILIKE $${params.length}
        OR COALESCE(s.host_origin, '') ILIKE $${params.length}
        OR t.name ILIKE $${params.length}
        OR t.tenant_key ILIKE $${params.length}
      )`);
    }

    if (filters.errorsOnly) {
      conditions.push("COALESCE(ast.error_count, 0) > 0");
    }

    if (filters.engagedOnly) {
      conditions.push("COALESCE(ms.user_message_count, 0) > 2");
    }

    const result = await client.query<ConversationAnalyticsSessionRow>(
      `WITH message_stats AS (
         SELECT
           s.id AS session_row_id,
           COUNT(m.id) AS message_count,
           COUNT(*) FILTER (WHERE m.role = 'user') AS user_message_count,
           COUNT(*) FILTER (WHERE m.role = 'assistant') AS assistant_message_count
         FROM sessions_v2 s
         LEFT JOIN messages_v2 m ON m.session_id = s.id
         GROUP BY s.id
       ),
       analytics_stats AS (
         SELECT
           tenant_id,
           session_id,
           COUNT(*) AS request_count,
           COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COUNT(*) FILTER (WHERE status <> 'completed') AS error_count,
           MAX(created_at) AS last_request_at
         FROM conversation_analytics
         GROUP BY tenant_id, session_id
       ),
       session_rows AS (
       SELECT
         t.id AS tenant_id,
         t.tenant_key,
         t.name AS tenant_name,
         s.client_session_id AS session_id,
         s.host_origin,
         s.created_at,
         s.updated_at,
         ast.last_request_at,
         COALESCE(ms.message_count, 0) AS message_count,
         COALESCE(ms.user_message_count, 0) AS user_message_count,
         COALESCE(ms.assistant_message_count, 0) AS assistant_message_count,
         COALESCE(ast.request_count, 0) AS request_count,
         COALESCE(ast.prompt_tokens, 0) AS prompt_tokens,
         COALESCE(ast.completion_tokens, 0) AS completion_tokens,
         COALESCE(ast.total_tokens, 0) AS total_tokens,
         COALESCE(ast.error_count, 0) AS error_count
       FROM sessions_v2 s
       INNER JOIN tenants t ON t.id = s.tenant_id
       LEFT JOIN message_stats ms ON ms.session_row_id = s.id
       LEFT JOIN analytics_stats ast ON ast.tenant_id = s.tenant_id AND ast.session_id = s.client_session_id
       WHERE ${conditions.join(" AND ")}
       )
       SELECT session_rows.*, COUNT(*) OVER() AS total_count
       FROM session_rows
       ORDER BY COALESCE(session_rows.last_request_at, session_rows.updated_at) DESC, session_rows.updated_at DESC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      [...params, normalizedLimit, normalizedOffset]
    );

    return {
      records: result.rows.map(mapTenantSessionAnalytics),
      totalCount: asCount(result.rows[0]?.total_count),
      limit: normalizedLimit,
      offset: normalizedOffset,
    };
  });
}

export async function bootstrapTenantSession(input: {
  tenantKey: string;
  sessionId: string;
  hostOrigin?: string | null;
  localMessages?: PersistedChatMessage[] | null;
  localProfile?: VisitorProfile | null;
  skipHostValidation?: boolean;
}): Promise<TenantBootstrap> {
  const tenant = await resolveTenant(input.tenantKey, input.hostOrigin, {
    skipHostValidation: input.skipHostValidation,
  });
  const persisted = await loadSessionState(tenant.tenantId, input.sessionId);
  const localMessages = sanitizeMessages(input.localMessages);
  const localProfile = sanitizeProfile(input.localProfile);

  if (persisted.messages.length === 0 && localMessages.length > 0) {
    await saveSessionState({
      tenantId: tenant.tenantId,
      sessionId: input.sessionId,
      hostOrigin: input.hostOrigin,
      messages: localMessages,
      visitorProfile: localProfile,
    });
    persisted.messages = localMessages;
    persisted.visitorProfile = localProfile;
  }

  const whatsappLink = await getWhatsAppLinkBySession({
    tenantId: tenant.tenantId,
    clientSessionId: input.sessionId,
  });

  const twilioWhatsAppConfigured = isTwilioWhatsAppConfigured();
  const twilioStatus = getTwilioWhatsAppConfigStatus();
  console.log("[bootstrap][whatsapp]", {
    tenantKey: tenant.tenantKey,
    twilioWhatsAppConfigured,
    twilioStatus,
    tenantWhatsappEnabled: Boolean(tenant.prompt.whatsappEnabled),
    sessionWhatsappLinked: Boolean(whatsappLink),
  });

  return {
    tenant: {
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      name: tenant.name,
      storageNamespace: tenant.storageNamespace,
      appName: tenant.appName,
      appUrl: tenant.appUrl,
      theme: tenant.theme,
      branding: tenant.branding,
      prompt: tenant.prompt,
      systemPrompt: tenant.systemPrompt,
      skillPrompts: tenant.skillPrompts,
    },
    tenantToken: createTenantToken({
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      hostOrigin: resolveTenantTokenHostOrigin(tenant, input.hostOrigin),
    }),
    session: {
      sessionId: input.sessionId,
      messages: persisted.messages,
      visitorProfile: persisted.visitorProfile,
      suggestions: persisted.suggestions ?? [],
      updatedAt: persisted.updatedAt,
      whatsappLinked: Boolean(whatsappLink),
    },
    twilioWhatsAppConfigured,
  };
}

export async function resolveTenantFromToken(
  tenantKey: string,
  tenantToken: string | null | undefined
): Promise<TenantRuntimeConfig> {
  const payload = verifyTenantToken(tenantToken);
  if (!payload || payload.tenantKey !== tenantKey) {
    throw new Error("Invalid tenant token.");
  }
  const tenant = await resolveTenant(payload.tenantKey, payload.hostOrigin);
  if (tenant.tenantId !== payload.tenantId) {
    throw new Error("Tenant token does not match the resolved tenant.");
  }
  return {
    tenantId: tenant.tenantId,
    tenantKey: tenant.tenantKey,
    name: tenant.name,
    storageNamespace: tenant.storageNamespace,
    appName: tenant.appName,
    appUrl: tenant.appUrl,
    theme: tenant.theme,
    branding: tenant.branding,
    prompt: tenant.prompt,
    systemPrompt: tenant.systemPrompt,
    skillPrompts: tenant.skillPrompts,
  };
}

type CatalogVersionRow = {
  id: string;
  tenant_id: string;
  source_id: string | null;
  source_type: CatalogSourceType;
  label: string;
  headers_json: string[];
  rows_json: Record<string, string>[];
  full_catalog_text: string;
  row_count: number;
  is_active: boolean;
  created_at: string;
  activated_at: string | null;
};

function mapCatalogVersion(row: CatalogVersionRow): CatalogVersionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    label: row.label,
    rowCount: row.row_count,
    isActive: row.is_active,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  };
}

async function insertCatalogVersion(
  client: PoolClient,
  input: {
    tenantId: string;
    sourceId: string | null;
    sourceType: CatalogSourceType;
    label: string;
    dataset: CatalogDataset;
    activate: boolean;
  }
): Promise<string> {
  if (input.activate) {
    await client.query(
      `UPDATE catalog_versions SET is_active = FALSE WHERE tenant_id = $1`,
      [input.tenantId]
    );
  }

  const id = randomUUID();
  await client.query(
    `INSERT INTO catalog_versions (
      id, tenant_id, source_id, source_type, label, headers_json, rows_json, full_catalog_text, row_count, is_active, activated_at
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
    [
      id,
      input.tenantId,
      input.sourceId,
      input.sourceType,
      input.label,
      JSON.stringify(input.dataset.headers),
      JSON.stringify(input.dataset.rows),
      input.dataset.fullCatalogText,
      input.dataset.rows.length,
      input.activate,
      input.activate ? new Date().toISOString() : null,
    ]
  );
  return id;
}

export async function getActiveCatalogDataset(
  tenantId: string
): Promise<CatalogDataset | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<CatalogVersionRow>(
      `SELECT * FROM catalog_versions
       WHERE tenant_id = $1 AND is_active = TRUE
       ORDER BY activated_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [tenantId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      headers: row.headers_json,
      rows: row.rows_json,
      fullCatalogText: row.full_catalog_text,
    };
  });
}

export async function listTenants(): Promise<TenantRecord[]> {
  if (!hasDatabase()) {
    return [FALLBACK_TENANT];
  }
  await seedDefaultTenant();
  return withDb(async (client) => {
    const result = await client.query<TenantRow>(
      `SELECT * FROM tenants ORDER BY created_at ASC`
    );
    const tenants: TenantRecord[] = [];
    for (const row of result.rows) {
      tenants.push(
        mapTenantRow(
          row,
          await loadTenantDomains(client, row.id),
          await loadShopifyInstallation(client, row.id)
        )
      );
    }
    return tenants;
  });
}

export async function createTenant(input: {
  tenantKey: string;
  name: string;
  appName?: string;
  appUrl?: string;
  domains?: string[];
  theme?: Record<string, unknown>;
  branding?: Record<string, unknown>;
  prompt?: Partial<TenantPromptConfig>;
  systemPrompt?: string | null;
  skillPrompts?: TenantSkillPrompts;
}): Promise<TenantRecord> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is required to create tenants.");
  }
  await ensurePlatformSchema();

  const tenantId = randomUUID();
  const tenantKey = input.tenantKey.trim();
  const storageNamespace = buildStorageNamespace(tenantKey);
  const domains = (input.domains ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const prompt: TenantPromptConfig = {
    brandName: input.name.trim(),
    ...input.prompt,
  };
  const systemPrompt = input.systemPrompt?.trim() || DEFAULT_SEEDED_SYSTEM_PROMPT;
  const skillPrompts = buildSeededSkillPrompts(input.skillPrompts);

  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO tenants (
          id, tenant_key, name, storage_namespace, app_name, app_url, theme_json, branding_json, prompt_json, system_prompt_text, skill_prompts_json, prompts_seeded
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)`,
        [
          tenantId,
          tenantKey,
          input.name.trim(),
          storageNamespace,
          input.appName?.trim() || input.name.trim(),
          input.appUrl?.trim() || "https://example.com",
          JSON.stringify(input.theme ?? {}),
          JSON.stringify(input.branding ?? {}),
          JSON.stringify(prompt),
          systemPrompt,
          JSON.stringify(skillPrompts),
          true,
        ]
      );
      for (const hostname of domains) {
        await client.query(
          `INSERT INTO tenant_domains (id, tenant_id, hostname) VALUES ($1,$2,$3)`,
          [randomUUID(), tenantId, hostname]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return resolveTenant(tenantKey);
}

export async function addTenantDomain(tenantId: string, hostname: string): Promise<void> {
  if (!hasDatabase()) throw new Error("DATABASE_URL is required to manage tenant domains.");
  await ensurePlatformSchema();
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO tenant_domains (id, tenant_id, hostname) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, hostname) DO NOTHING`,
      [randomUUID(), tenantId, hostname.trim().toLowerCase()]
    );
  });
}

export async function updateTenantConfig(input: {
  tenantId: string;
  name?: string;
  appName?: string;
  appUrl?: string;
  theme?: Record<string, unknown>;
  branding?: Record<string, unknown>;
  prompt?: Partial<TenantPromptConfig>;
  systemPrompt?: string | null;
  skillPrompts?: TenantSkillPrompts;
}): Promise<void> {
  if (!hasDatabase()) throw new Error("DATABASE_URL is required to update tenant config.");
  await ensurePlatformSchema();
  await withDb(async (client) => {
    const currentResult = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
      [input.tenantId]
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Tenant not found.");
    await client.query(
      `UPDATE tenants
       SET name = $2,
           app_name = $3,
           app_url = $4,
           theme_json = $5::jsonb,
           branding_json = $6::jsonb,
           prompt_json = $7::jsonb,
           system_prompt_text = $8,
           skill_prompts_json = $9::jsonb,
           prompts_seeded = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [
        input.tenantId,
        input.name?.trim() || current.name,
        input.appName?.trim() || current.app_name,
        input.appUrl?.trim() || current.app_url,
        JSON.stringify({ ...(current.theme_json ?? {}), ...(input.theme ?? {}) }),
        JSON.stringify({ ...(current.branding_json ?? {}), ...(input.branding ?? {}) }),
        JSON.stringify({
          brandName: input.name?.trim() || current.name,
          ...(current.prompt_json ?? {}),
          ...(input.prompt ?? {}),
        }),
        input.systemPrompt === undefined ? current.system_prompt_text : input.systemPrompt?.trim() || null,
        JSON.stringify(input.skillPrompts ?? current.skill_prompts_json ?? {}),
      ]
    );
  });
}

export async function resolveTenantById(tenantId: string): Promise<TenantRecord | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return mapTenantRow(
      row,
      await loadTenantDomains(client, row.id),
      await loadShopifyInstallation(client, row.id)
    );
  });
}

export async function upsertTenantFromShopifyInstall(input: {
  shopDomain: string;
  storefrontDomain?: string | null;
  additionalDomains?: string[];
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes: string[];
  shopName: string;
  shopOwner?: string | null;
  email?: string | null;
  currencyCode?: string | null;
}): Promise<TenantRecord> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is required to save Shopify installations.");
  }

  await ensurePlatformSchema();
  const normalizedShopDomain = normalizeShopifyShopDomain(input.shopDomain);
  if (!normalizedShopDomain) {
    throw new Error("Invalid Shopify shop domain provided for tenant upsert.");
  }
  const normalizedStorefrontDomain = input.storefrontDomain?.trim().toLowerCase() || null;
  const normalizedAdditionalDomains = [...new Set(
    (input.additionalDomains ?? [])
      .map((domain) => String(domain || "").trim().toLowerCase())
      .filter(Boolean)
  )];

  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      const existingInstallationResult = await client.query<ShopifyInstallationRow>(
        `SELECT * FROM shopify_installations WHERE shop_domain = $1 LIMIT 1`,
        [normalizedShopDomain]
      );

      let tenantId = existingInstallationResult.rows[0]?.tenant_id;

      if (!tenantId) {
        tenantId = await findPreferredTenantIdByDomains(client, [
          normalizedShopDomain,
          normalizedStorefrontDomain,
          ...normalizedAdditionalDomains,
        ]);
      }

      if (!tenantId) {
        tenantId = randomUUID();
        const tenantKey = await ensureUniqueTenantKey(
          client,
          deriveTenantKey(normalizedStorefrontDomain || normalizedShopDomain)
        );
        const tenantName = input.shopName.trim() || normalizedShopDomain.replace(/\.myshopify\.com$/, "");
        const appUrl = normalizedStorefrontDomain
          ? `https://${normalizedStorefrontDomain}`
          : `https://${normalizedShopDomain}`;
        const prompt: TenantPromptConfig = {
          brandName: tenantName,
          websiteUrl: appUrl,
        };

        await client.query(
          `INSERT INTO tenants (
            id, tenant_key, name, storage_namespace, app_name, app_url, theme_json, branding_json, prompt_json, system_prompt_text, skill_prompts_json, prompts_seeded
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)`,
          [
            tenantId,
            tenantKey,
            tenantName,
            buildStorageNamespace(tenantKey),
            `${tenantName} Assistant`,
            appUrl,
            JSON.stringify({}),
            JSON.stringify({}),
            JSON.stringify(prompt),
            DEFAULT_SEEDED_SYSTEM_PROMPT,
            JSON.stringify(DEFAULT_SEEDED_SKILL_PROMPTS),
            true,
          ]
        );
      } else {
        const currentTenantResult = await client.query<TenantRow>(
          `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
          [tenantId]
        );
        const currentTenant = currentTenantResult.rows[0];
        if (currentTenant) {
          const tenantName = input.shopName.trim() || currentTenant.name;
          const appUrl = normalizedStorefrontDomain
            ? `https://${normalizedStorefrontDomain}`
            : `https://${normalizedShopDomain}`;
          await client.query(
            `UPDATE tenants
             SET name = $2,
                 app_name = $3,
                 app_url = $4,
                 prompt_json = $5::jsonb,
                 updated_at = NOW()
             WHERE id = $1`,
            [
              tenantId,
              tenantName,
              `${tenantName} Assistant`,
              appUrl,
              JSON.stringify({
                ...(currentTenant.prompt_json ?? {}),
                brandName: tenantName,
                websiteUrl: appUrl,
              }),
            ]
          );
        }
      }

      for (const hostname of [
        normalizedShopDomain,
        normalizedStorefrontDomain,
        ...normalizedAdditionalDomains,
      ].filter(Boolean) as string[]) {
        await client.query(
          `INSERT INTO tenant_domains (id, tenant_id, hostname) VALUES ($1,$2,$3)
           ON CONFLICT (tenant_id, hostname) DO NOTHING`,
          [randomUUID(), tenantId, hostname]
        );
      }

      await client.query(
        `INSERT INTO shopify_installations (
          id, tenant_id, shop_domain, storefront_domain, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at, scopes_json, status, shop_name, shop_owner, email, currency_code, uninstalled_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'installed',$10,$11,$12,$13,NULL)
        ON CONFLICT (shop_domain)
        DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          storefront_domain = EXCLUDED.storefront_domain,
          access_token = EXCLUDED.access_token,
          access_token_expires_at = EXCLUDED.access_token_expires_at,
          refresh_token = EXCLUDED.refresh_token,
          refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
          scopes_json = EXCLUDED.scopes_json,
          status = 'installed',
          shop_name = EXCLUDED.shop_name,
          shop_owner = EXCLUDED.shop_owner,
          email = EXCLUDED.email,
          currency_code = EXCLUDED.currency_code,
          uninstalled_at = NULL,
          updated_at = NOW()`,
        [
          existingInstallationResult.rows[0]?.id || randomUUID(),
          tenantId,
          normalizedShopDomain,
          normalizedStorefrontDomain,
          input.accessToken,
          input.accessTokenExpiresAt ?? null,
          input.refreshToken ?? null,
          input.refreshTokenExpiresAt ?? null,
          JSON.stringify(input.scopes),
          input.shopName.trim() || null,
          input.shopOwner || null,
          input.email || null,
          input.currencyCode || null,
        ]
      );

      await upsertShopifyCatalogSource(client, tenantId, normalizedShopDomain);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  const tenant = await resolveTenantById(
    (
      await withDb(async (client) => {
        const result = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM shopify_installations WHERE shop_domain = $1 LIMIT 1`,
          [normalizedShopDomain]
        );
        return result.rows[0]?.tenant_id || "";
      })
    )
  );
  if (!tenant) {
    throw new Error("Tenant was not found after Shopify install.");
  }
  return tenant;
}

export async function ensureTenantForShopifyStorefront(input: {
  shopDomain: string;
  storefrontDomain?: string | null;
}): Promise<TenantRecord | null> {
  if (!hasDatabase()) return null;

  await ensurePlatformSchema();
  const normalizedShopDomain = normalizeShopifyShopDomain(input.shopDomain);
  const normalizedStorefrontDomain = input.storefrontDomain?.trim().toLowerCase() || null;
  if (!normalizedShopDomain) return null;

  let tenantId = "";

  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      const installationResult = await client.query<ShopifyInstallationRow>(
        `SELECT * FROM shopify_installations WHERE shop_domain = $1 LIMIT 1`,
        [normalizedShopDomain]
      );

      tenantId = installationResult.rows[0]?.tenant_id || "";

      if (!tenantId) {
        tenantId = await findPreferredTenantIdByDomains(client, [
          normalizedShopDomain,
          normalizedStorefrontDomain,
        ]);
      }

      if (!tenantId) {
        tenantId = randomUUID();
        const tenantKey = await ensureUniqueTenantKey(
          client,
          deriveTenantKey(normalizedStorefrontDomain || normalizedShopDomain)
        );
        const tenantName = (normalizedStorefrontDomain || normalizedShopDomain)
          .replace(/^www\./, "")
          .replace(/\.myshopify\.com$/, "")
          .replace(/\x00/g, "")
          .trim() || "Shopify Store";
        const appUrl = normalizedStorefrontDomain
          ? `https://${normalizedStorefrontDomain}`
          : `https://${normalizedShopDomain}`;
        const prompt: TenantPromptConfig = {
          brandName: tenantName,
          websiteUrl: appUrl,
        };

        await client.query(
          `INSERT INTO tenants (
            id, tenant_key, name, storage_namespace, app_name, app_url, theme_json, branding_json, prompt_json, system_prompt_text, skill_prompts_json, prompts_seeded
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)`,
          [
            tenantId,
            tenantKey,
            tenantName,
            buildStorageNamespace(tenantKey),
            `${tenantName} Assistant`,
            appUrl,
            JSON.stringify({}),
            JSON.stringify({}),
            JSON.stringify(prompt),
            DEFAULT_SEEDED_SYSTEM_PROMPT,
            JSON.stringify(DEFAULT_SEEDED_SKILL_PROMPTS),
            true,
          ]
        );
      }

      for (const hostname of [normalizedShopDomain, normalizedStorefrontDomain].filter(Boolean) as string[]) {
        await client.query(
          `INSERT INTO tenant_domains (id, tenant_id, hostname) VALUES ($1,$2,$3)
           ON CONFLICT (tenant_id, hostname) DO NOTHING`,
          [randomUUID(), tenantId, hostname]
        );
      }

      if (installationResult.rows[0]?.id) {
        await client.query(
          `UPDATE shopify_installations
           SET storefront_domain = COALESCE($2, storefront_domain), updated_at = NOW()
           WHERE id = $1`,
          [installationResult.rows[0].id, normalizedStorefrontDomain]
        );

        await upsertShopifyCatalogSource(client, tenantId, normalizedShopDomain);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return tenantId ? resolveTenantById(tenantId) : null;
}

export async function markShopifyInstallationUninstalled(shopDomain: string): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();
  await withDb(async (client) => {
    await client.query(
      `UPDATE shopify_installations
       SET status = 'uninstalled',
           uninstalled_at = NOW(),
           updated_at = NOW()
       WHERE shop_domain = $1`,
      [shopDomain.trim().toLowerCase()]
    );
  });
}

export async function getTenantShopifyInstallation(
  tenantId: string
): Promise<ShopifyInstallationRecord | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => loadShopifyInstallation(client, tenantId));
}

export async function updateShopifyInstallationTokens(input: {
  tenantId: string;
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes?: string[];
}): Promise<void> {
  if (!hasDatabase()) {
    throw new Error("DATABASE_URL is required to update Shopify installation tokens.");
  }

  await ensurePlatformSchema();
  await withDb(async (client) => {
    await client.query(
      `UPDATE shopify_installations
       SET access_token = $2,
           access_token_expires_at = $3,
           refresh_token = $4,
           refresh_token_expires_at = $5,
           scopes_json = COALESCE($6::jsonb, scopes_json),
           updated_at = NOW()
       WHERE tenant_id = $1`,
      [
        input.tenantId,
        input.accessToken,
        input.accessTokenExpiresAt ?? null,
        input.refreshToken ?? null,
        input.refreshTokenExpiresAt ?? null,
        input.scopes ? JSON.stringify(input.scopes) : null,
      ]
    );
  });
}

export async function getTenantByShopifyShopDomain(
  shopDomain: string | null | undefined
): Promise<TenantRecord | null> {
  const normalizedShopDomain = String(shopDomain || "").trim().toLowerCase();
  if (!normalizedShopDomain || !hasDatabase()) return null;

  await ensurePlatformSchema();
  return withDb(async (client) => {
    const installationResult = await client.query<ShopifyInstallationRow>(
      `SELECT * FROM shopify_installations WHERE shop_domain = $1 LIMIT 1`,
      [normalizedShopDomain]
    );

    const installationRow = installationResult.rows[0];
    if (!installationRow?.tenant_id) return null;

    const tenantResult = await client.query<TenantRow>(
      `SELECT * FROM tenants WHERE id = $1 LIMIT 1`,
      [installationRow.tenant_id]
    );

    const tenantRow = tenantResult.rows[0];
    if (!tenantRow) return null;

    return mapTenantRow(
      tenantRow,
      await loadTenantDomains(client, tenantRow.id),
      mapShopifyInstallationRow(installationRow)
    );
  });
}

type CatalogSourceRow = {
  id: string;
  tenant_id: string;
  source_type: CatalogSourceType;
  name: string;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
  sync_requested_at: string | null;
};

function mapCatalogSource(row: CatalogSourceRow): CatalogSourceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.source_type,
    name: row.name,
    config: row.config_json ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
    syncRequestedAt: row.sync_requested_at,
  };
}

export async function createCatalogSource(input: {
  tenantId: string;
  type: CatalogSourceType;
  name: string;
  config: Record<string, unknown>;
}): Promise<CatalogSourceRecord> {
  if (!hasDatabase()) throw new Error("DATABASE_URL is required to manage catalog sources.");
  await ensurePlatformSchema();
  const id = randomUUID();
  return withDb(async (client) => {
    const result = await client.query<CatalogSourceRow>(
      `INSERT INTO catalog_sources (id, tenant_id, source_type, name, config_json)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       RETURNING *`,
      [id, input.tenantId, input.type, input.name.trim(), JSON.stringify(input.config)]
    );
    return mapCatalogSource(result.rows[0]);
  });
}

export async function listCatalogSources(tenantId: string): Promise<CatalogSourceRecord[]> {
  if (!hasDatabase()) return [];
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<CatalogSourceRow>(
      `SELECT * FROM catalog_sources WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map(mapCatalogSource);
  });
}

export async function getCatalogSource(sourceId: string): Promise<CatalogSourceRecord | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<CatalogSourceRow>(
      `SELECT * FROM catalog_sources WHERE id = $1 LIMIT 1`,
      [sourceId]
    );
    return result.rows[0] ? mapCatalogSource(result.rows[0]) : null;
  });
}

export async function listCatalogVersions(tenantId: string): Promise<CatalogVersionRecord[]> {
  if (!hasDatabase()) return [];
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<CatalogVersionRow>(
      `SELECT * FROM catalog_versions WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: CatalogVersionRow) => mapCatalogVersion(row));
  });
}

export async function createCatalogVersion(input: {
  tenantId: string;
  sourceId: string | null;
  sourceType: CatalogSourceType;
  label: string;
  dataset: CatalogDataset;
  activate?: boolean;
}): Promise<string> {
  if (!hasDatabase()) throw new Error("DATABASE_URL is required to create catalog versions.");
  await ensurePlatformSchema();
  return withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `catalog-sync:${input.tenantId}`,
      ]);
      const id = await insertCatalogVersion(client, {
        tenantId: input.tenantId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        label: input.label,
        dataset: input.dataset,
        activate: input.activate !== false,
      });
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function activateCatalogVersion(tenantId: string, versionId: string): Promise<void> {
  if (!hasDatabase()) throw new Error("DATABASE_URL is required to activate catalog versions.");
  await ensurePlatformSchema();
  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `catalog-sync:${tenantId}`,
      ]);
      await client.query(`UPDATE catalog_versions SET is_active = FALSE WHERE tenant_id = $1`, [tenantId]);
      await client.query(
        `UPDATE catalog_versions
         SET is_active = TRUE, activated_at = NOW()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, versionId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function updateCatalogSourceSyncStamp(sourceId: string): Promise<void> {
  if (!hasDatabase()) return;
  await ensurePlatformSchema();
  await withDb(async (client) => {
    await client.query(
      `UPDATE catalog_sources SET last_synced_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [sourceId]
    );
  });
}

export async function markShopifyCatalogSyncRequested(tenantId: string): Promise<boolean> {
  if (!hasDatabase()) return false;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query(
      `UPDATE catalog_sources
       SET sync_requested_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND source_type = 'shopify'
       RETURNING id`,
      [tenantId]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function shouldRunShopifyCatalogWebhookSync(
  tenantId: string
): Promise<boolean> {
  if (!hasDatabase()) return false;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<{
      sync_requested_at: string | null;
      last_synced_at: string | null;
    }>(
      `SELECT sync_requested_at, last_synced_at
       FROM catalog_sources
       WHERE tenant_id = $1 AND source_type = 'shopify'
       LIMIT 1`,
      [tenantId]
    );
    const row = result.rows[0];
    if (!row?.sync_requested_at) return false;

    const requestedAt = new Date(row.sync_requested_at).getTime();
    const lastSyncedAt = row.last_synced_at
      ? new Date(row.last_synced_at).getTime()
      : 0;

    return requestedAt > lastSyncedAt;
  });
}

export async function createShareLink(input: {
  tenantId: string;
  messages: SharedChatMessage[];
}): Promise<string> {
  if (!hasDatabase()) {
    return randomUUID().slice(0, 8);
  }
  await ensurePlatformSchema();
  const id = randomUUID().replace(/-/g, "").slice(0, 10);
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO share_links (id, tenant_id, messages_json, expires_at)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [
        id,
        input.tenantId,
        JSON.stringify(sanitizeSharedMessages(input.messages)),
        new Date(Date.now() + SHARE_TTL_MS).toISOString(),
      ]
    );
  });
  return id;
}

export async function getShareLinkMessages(id: string): Promise<SharedChatMessage[] | null> {
  if (!hasDatabase()) return null;
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const result = await client.query<{ messages_json: SharedChatMessage[] }>(
      `SELECT messages_json
       FROM share_links
       WHERE id = $1 AND expires_at > NOW()
       LIMIT 1`,
      [id]
    );
    return result.rows[0]?.messages_json ?? null;
  });
}

export async function getTenantDebugSnapshot(tenantId: string): Promise<{
  conversations: Array<{ sessionId: string; updatedAt: string }>;
  shares: Array<{ id: string; createdAt: string; expiresAt: string }>;
}> {
  if (!hasDatabase()) {
    return { conversations: [], shares: [] };
  }
  await ensurePlatformSchema();
  return withDb(async (client) => {
    const [conversations, shares] = await Promise.all([
      client.query<{ session_id: string; updated_at: string }>(
        `SELECT client_session_id AS session_id, updated_at
         FROM sessions_v2
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT 20`,
        [tenantId]
      ),
      client.query<{ id: string; created_at: string; expires_at: string }>(
        `SELECT id, created_at, expires_at
         FROM share_links
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [tenantId]
      ),
    ]);

    return {
      conversations: conversations.rows.map((row: { session_id: string; updated_at: string }) => ({
        sessionId: row.session_id,
        updatedAt: row.updated_at,
      })),
      shares: shares.rows.map((row: { id: string; created_at: string; expires_at: string }) => ({
        id: row.id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
    };
  });
}
