import { syncTenantShopifyCatalog } from "../src/lib/shopify-catalog-sync";
import { getTenantByShopifyShopDomain } from "../src/lib/tenant-platform";

const shop =
  process.argv.find((arg) => arg.startsWith("--shop="))?.slice("--shop=".length) ||
  "naples-mattress-6d9e.myshopify.com";
const appOrigin =
  process.argv.find((arg) => arg.startsWith("--app-origin="))?.slice("--app-origin=".length) ||
  "https://rtg-roomie-chatbot-x5el.vercel.app";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const tenant = await getTenantByShopifyShopDomain(shop);
if (!tenant) {
  console.error(`No tenant found for shop: ${shop}`);
  process.exit(1);
}

if (tenant.shopifyInstallation?.status !== "installed") {
  console.error(`Shopify installation is not active for ${shop}`);
  process.exit(1);
}

console.log(`Syncing Shopify catalog for ${tenant.name} (${tenant.tenantKey})...`);

const result = await syncTenantShopifyCatalog({
  tenantId: tenant.tenantId,
  appOrigin,
});

console.log(`Catalog sync complete: ${result.rowCount.toLocaleString()} rows (source ${result.sourceId}).`);
