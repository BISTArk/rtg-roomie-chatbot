import {
  assertShopifyAdminAccess,
  buildCatalogDatasetFromShopify,
  getShopifyAppConfig,
  isShopifyAdminAccessError,
} from "@/lib/shopify";
import {
  createCatalogVersion,
  getActiveCatalogDataset,
  getTenantShopifyInstallation,
  listCatalogSources,
  updateCatalogSourceSyncStamp,
} from "@/lib/tenant-platform";

export type CatalogSyncStatus = "ready" | "failed";

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
  await assertShopifyAdminAccess({
    shop: installation.shopDomain,
    accessToken: installation.accessToken,
    config,
  });

  const dataset = await buildCatalogDatasetFromShopify({
    shop: installation.shopDomain,
    storefrontDomain: installation.storefrontDomain,
    accessToken: installation.accessToken,
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