import { NextRequest, NextResponse } from "next/server";
import { buildShopifyResyncCatalogUrl, getShopifyAppConfig, normalizeShopifyShopDomain } from "@/lib/shopify";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";

export async function GET(request: NextRequest) {
  const shop = normalizeShopifyShopDomain(request.nextUrl.searchParams.get("shop"));
  const config = getShopifyAppConfig(request.nextUrl.origin);

  if (!shop) {
    return Response.json({ error: "A valid shop parameter is required." }, { status: 400 });
  }

  const installUrl = new URL("/api/shopify/install", config.appUrl);
  installUrl.searchParams.set("shop", shop);

  const tenant = await getTenantByShopifyShopDomain(shop);
  if (!tenant?.shopifyInstallation || tenant.shopifyInstallation.status !== "installed") {
    return NextResponse.redirect(installUrl);
  }

  return NextResponse.redirect(buildShopifyResyncCatalogUrl(config.appUrl, shop));
}
