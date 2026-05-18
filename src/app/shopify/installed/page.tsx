import { isAdminAuthenticated } from "@/lib/admin-auth";
import { normalizeShopifyShopDomain } from "@/lib/shopify";
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
  const catalogSync = params.catalogSync || "";
  const adminAuthenticated = await isAdminAuthenticated();
  const tenant = adminAuthenticated && shop !== "your Shopify store"
    ? await getTenantByShopifyShopDomain(shop)
    : null;
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
