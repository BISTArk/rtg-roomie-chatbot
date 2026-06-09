import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getShopifyAppConfig, normalizeShopifyShopDomain } from "@/lib/shopify";
import { ensureTenantShopifyCatalogSynced } from "@/lib/shopify-catalog-sync";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";
import { ShopifyInstalledView } from "@/components/ShopifyInstalledView";

export default async function ShopifyInstalledPage({
  searchParams,
}: {
  searchParams?: Promise<{ shop?: string; catalogSync?: string }>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as {
    shop?: string;
    catalogSync?: string;
  };
  const shop = normalizeShopifyShopDomain(params.shop) || "your Shopify store";
  const adminAuthenticated = await isAdminAuthenticated();
  const tenant = shop !== "your Shopify store" ? await getTenantByShopifyShopDomain(shop) : null;
  let catalogSync = params.catalogSync || "";

  if (tenant?.shopifyInstallation?.status === "installed") {
    const ensured = await ensureTenantShopifyCatalogSynced({
      tenantId: tenant.tenantId,
      appOrigin: getShopifyAppConfig().appUrl,
    });
    catalogSync = ensured;
  }
  const tenantKey = tenant?.tenantKey || "";
  const shopifyApiKey = process.env.SHOPIFY_API_KEY?.trim() || "";
  const enableEmbedUrl =
    shopifyApiKey && shop && shop !== "your Shopify store"
      ? `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(shopifyApiKey)}/shop-assist`
      : "";

  return (
    <ShopifyInstalledView
      shop={shop}
      catalogSync={catalogSync}
      adminAuthenticated={adminAuthenticated}
      tenantKey={tenantKey}
      enableEmbedUrl={enableEmbedUrl}
    />
  );
}
