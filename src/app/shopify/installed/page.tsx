import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  buildShopifyResyncCatalogUrl,
  getShopifyAppConfig,
  normalizeShopifyShopDomain,
} from "@/lib/shopify";
import {
  ensureTenantShopifyCatalogSynced,
  formatCatalogSyncError,
  syncTenantShopifyCatalog,
} from "@/lib/shopify-catalog-sync";
import { getActiveCatalogDataset, getTenantByShopifyShopDomain } from "@/lib/tenant-platform";
import { ShopifyInstalledView } from "@/components/ShopifyInstalledView";

export default async function ShopifyInstalledPage({
  searchParams,
}: {
  searchParams?: Promise<{
    shop?: string;
    catalogSync?: string;
    catalogSyncError?: string;
    resync?: string;
  }>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as {
    shop?: string;
    catalogSync?: string;
    catalogSyncError?: string;
    resync?: string;
  };
  const shop = normalizeShopifyShopDomain(params.shop) || "your Shopify store";
  const adminAuthenticated = await isAdminAuthenticated();
  const tenant = shop !== "your Shopify store" ? await getTenantByShopifyShopDomain(shop) : null;
  const appConfig = getShopifyAppConfig();

  if (params.resync === "1" && tenant?.shopifyInstallation?.status === "installed") {
    const resultUrl = new URL("/shopify/installed", appConfig.appUrl);
    resultUrl.searchParams.set("shop", shop);

    try {
      await syncTenantShopifyCatalog({
        tenantId: tenant.tenantId,
        appOrigin: appConfig.appUrl,
      });
      resultUrl.searchParams.set("catalogSync", "ready");
    } catch (error) {
      console.error("[shopify installed] manual catalog resync failed:", error);
      resultUrl.searchParams.set("catalogSync", "failed");
      resultUrl.searchParams.set("catalogSyncError", formatCatalogSyncError(error));
    }

    redirect(resultUrl.pathname + resultUrl.search);
  }

  let catalogSync = params.catalogSync || "";
  let catalogSyncError = params.catalogSyncError || "";

  if (tenant?.shopifyInstallation?.status === "installed") {
    const existingCatalog = await getActiveCatalogDataset(tenant.tenantId);
    if (existingCatalog) {
      catalogSync = "ready";
    } else if (!catalogSync) {
      catalogSync = await ensureTenantShopifyCatalogSynced({
        tenantId: tenant.tenantId,
        appOrigin: appConfig.appUrl,
      });
    }
  }

  const tenantKey = tenant?.tenantKey || "";
  const shopifyApiKey = process.env.SHOPIFY_API_KEY?.trim() || "";
  const enableEmbedUrl =
    shopifyApiKey && shop && shop !== "your Shopify store"
      ? `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(shopifyApiKey)}/shop-assist`
      : "";

  const reinstallUrl =
    shop !== "your Shopify store"
      ? `${appConfig.appUrl}/api/shopify/install?shop=${encodeURIComponent(shop)}`
      : "";
  const resyncCatalogUrl =
    shop !== "your Shopify store" ? buildShopifyResyncCatalogUrl(appConfig.appUrl, shop) : "";

  return (
    <ShopifyInstalledView
      shop={shop}
      catalogSync={catalogSync}
      catalogSyncError={catalogSyncError || undefined}
      adminAuthenticated={adminAuthenticated}
      tenantKey={tenantKey}
      enableEmbedUrl={enableEmbedUrl}
      reinstallUrl={reinstallUrl || undefined}
      resyncCatalogUrl={resyncCatalogUrl || undefined}
    />
  );
}
