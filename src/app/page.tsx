import { ChatWidget } from "@/components/ChatWidget";
import { MockContextPanel } from "@/components/MockContextPanel";
import { ShopifyAuthRedirect } from "@/components/ShopifyAuthRedirect";
import { ShopifyInstalledView } from "@/components/ShopifyInstalledView";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getShopifyAppConfig, normalizeShopifyShopDomain } from "@/lib/shopify";
import { ensureTenantShopifyCatalogSynced } from "@/lib/shopify-catalog-sync";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";
import Script from "next/script";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ shop?: string }>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as {
    shop?: string;
  };
  const shop = normalizeShopifyShopDomain(params.shop);

  if (shop) {
    const tenant = await getTenantByShopifyShopDomain(shop);

    if (!tenant?.shopifyInstallation || tenant.shopifyInstallation.status !== "installed") {
      const appConfig = getShopifyAppConfig();
      return (
        <ShopifyAuthRedirect
          shop={shop}
          installUrl={`${appConfig.appUrl}/api/shopify/install?shop=${encodeURIComponent(shop)}`}
        />
      );
    }

    const appConfig = getShopifyAppConfig();
    const catalogSync = await ensureTenantShopifyCatalogSynced({
      tenantId: tenant.tenantId,
      appOrigin: appConfig.appUrl,
    });
    const adminAuthenticated = await isAdminAuthenticated();
    const tenantKey = adminAuthenticated ? tenant.tenantKey : "";
    const shopifyApiKey = process.env.SHOPIFY_API_KEY?.trim() || "";
    const enableEmbedUrl =
      shopifyApiKey
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

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center"
      style={{ backgroundColor: "var(--widget-surface-alt)" }}
    >
      <div className="text-center">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--widget-text)" }}
        >
          Storefront Demo
        </h1>
        <p
          className="mt-2 text-base"
          style={{ color: "var(--widget-text-muted)" }}
        >
          Demo page — the shopping assistant widget is in the bottom-right corner
        </p>
      </div>

      <MockContextPanel />

      <Script
        id="shop-assist-demo-config"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.SHOP_ASSIST_CONFIG = Object.assign({}, window.SHOP_ASSIST_CONFIG || {}, { tenantKey: "shop-assist-demo" });`,
        }}
      />

      <ChatWidget />
    </main>
  );
}
