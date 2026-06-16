import {
  assertShopifyAdminAccess,
  buildCatalogDatasetFromShopify,
  getShopifyAppConfig,
  isShopifyAdminAccessError,
} from "@/lib/shopify";
import { getShopifyAccessTokenForInstallation } from "@/lib/shopify-access-token";
import {
  createCatalogVersion,
  getActiveCatalogDataset,
  getTenantShopifyInstallation,
  listCatalogSources,
  markShopifyCatalogSyncRequested,
  shouldRunShopifyCatalogWebhookSync,
  updateCatalogSourceSyncStamp,
} from "@/lib/tenant-platform";

export type CatalogSyncStatus = "ready" | "failed";

/** Coalesce rapid Shopify product webhooks before running a full catalog sync. */
export const SHOPIFY_PRODUCT_WEBHOOK_SYNC_DEBOUNCE_MS = 30_000;

const PRODUCT_CATALOG_WEBHOOK_TOPICS = new Set([
  "products/create",
  "products/update",
  "products/delete",
]);

export function isShopifyProductCatalogWebhookTopic(topic: string): boolean {
  return PRODUCT_CATALOG_WEBHOOK_TOPICS.has(topic.trim().toLowerCase());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatCatalogSyncError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim().slice(0, 240);
  }
  return "Unknown catalog sync error.";
}

export async function syncTenantShopifyCatalog(input: {
  tenantId: string;
  appOrigin: string;
}): Promise<{ sourceId: string; rowCount: number }> {
  const source = (await listCatalogSources(input.tenantId)).find(
    (candidate) => candidate.type === "shopify"
  );

  if (!source) {
    throw new Error("Shopify catalog source not found for this tenant.");
  }

  const installation = await getTenantShopifyInstallation(input.tenantId);
  if (!installation || installation.status !== "installed") {
    throw new Error("Shopify installation not found for this tenant.");
  }

  const config = getShopifyAppConfig(input.appOrigin);
  const accessToken = await getShopifyAccessTokenForInstallation({
    installation,
    appOrigin: input.appOrigin,
  });

  await assertShopifyAdminAccess({
    shop: installation.shopDomain,
    accessToken,
    config,
  });

  const dataset = await buildCatalogDatasetFromShopify({
    shop: installation.shopDomain,
    storefrontDomain: installation.storefrontDomain,
    accessToken,
    config,
  });

  await createCatalogVersion({
    tenantId: input.tenantId,
    sourceId: source.id,
    sourceType: source.type,
    label: `${source.name} sync ${new Date().toISOString().slice(0, 10)}`,
    dataset,
    activate: true,
  });
  await updateCatalogSourceSyncStamp(source.id);

  return {
    sourceId: source.id,
    rowCount: dataset.rows.length,
  };
}

/** Sync Shopify catalog when the store is installed but has no active snapshot yet. */
export async function ensureTenantShopifyCatalogSynced(input: {
  tenantId: string;
  appOrigin: string;
}): Promise<CatalogSyncStatus> {
  const existing = await getActiveCatalogDataset(input.tenantId);
  if (existing) {
    return "ready";
  }

  try {
    await syncTenantShopifyCatalog(input);
    return "ready";
  } catch (error) {
    if (isShopifyAdminAccessError(error)) {
      console.error("[shopify catalog] ensure sync failed:", error.message);
    } else {
      console.error("[shopify catalog] ensure sync failed:", error);
    }
    return "failed";
  }
}

export async function requestShopifyCatalogSyncFromWebhook(
  tenantId: string
): Promise<boolean> {
  return markShopifyCatalogSyncRequested(tenantId);
}

export async function runDebouncedShopifyCatalogSyncFromWebhook(input: {
  tenantId: string;
  appOrigin: string;
  topic?: string;
  webhookId?: string | null;
  debounceMs?: number;
}): Promise<{ synced: boolean; rowCount?: number; skipped?: string }> {
  const debounceMs = input.debounceMs ?? SHOPIFY_PRODUCT_WEBHOOK_SYNC_DEBOUNCE_MS;
  await sleep(debounceMs);

  const shouldSync = await shouldRunShopifyCatalogWebhookSync(input.tenantId);
  if (!shouldSync) {
    return { synced: false, skipped: "no-pending-sync-request" };
  }

  try {
    const result = await syncTenantShopifyCatalog({
      tenantId: input.tenantId,
      appOrigin: input.appOrigin,
    });
    console.info(
      "[shopify catalog webhook] synced tenant",
      input.tenantId,
      input.topic || "products/*",
      input.webhookId || "",
      `${result.rowCount} rows`
    );
    return { synced: true, rowCount: result.rowCount };
  } catch (error) {
    if (isShopifyAdminAccessError(error)) {
      console.error("[shopify catalog webhook] sync failed:", error.message);
    } else {
      console.error("[shopify catalog webhook] sync failed:", error);
    }
    throw error;
  }
}