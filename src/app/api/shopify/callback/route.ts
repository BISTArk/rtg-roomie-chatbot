import { NextRequest, NextResponse } from "next/server";
import {
  exchangeShopifyCodeForAccessToken,
  fetchShopifyShopDetails,
  getShopifyAppConfig,
  normalizeShopifyShopDomain,
  verifyShopifyCallbackHmac,
  verifyShopifyInstallState,
} from "@/lib/shopify";
import { syncTenantShopifyCatalog } from "@/lib/shopify-catalog-sync";
import { upsertTenantFromShopifyInstall } from "@/lib/tenant-platform";

const SHOPIFY_INSTALL_COOKIE = "shop_assist_shopify_install_state";

export async function GET(request: NextRequest) {
  try {
    const config = getShopifyAppConfig(request.nextUrl.origin);
    const shop = normalizeShopifyShopDomain(request.nextUrl.searchParams.get("shop"));
    const code = String(request.nextUrl.searchParams.get("code") || "").trim();
    const state = String(request.nextUrl.searchParams.get("state") || "").trim();

    if (!shop || !code || !state) {
      return Response.json({ error: "Shopify callback is missing required parameters." }, { status: 400 });
    }

    if (!verifyShopifyCallbackHmac(request.nextUrl.searchParams, config.apiSecret)) {
      return Response.json({ error: "Invalid Shopify callback signature." }, { status: 401 });
    }

    const verifiedState = verifyShopifyInstallState(state, config.apiSecret);
    if (!verifiedState || verifiedState.shop !== shop) {
      return Response.json({ error: "Shopify install state validation failed." }, { status: 401 });
    }

    const token = await exchangeShopifyCodeForAccessToken({ shop, code, config });
    const shopDetails = await fetchShopifyShopDetails({
      shop,
      accessToken: token.accessToken,
      config,
    });

    const tenant = await upsertTenantFromShopifyInstall({
      shopDomain: shopDetails.myshopifyDomain,
      storefrontDomain: shopDetails.primaryDomainHost,
      accessToken: token.accessToken,
      scopes: token.scopes,
      shopName: shopDetails.name,
      shopOwner: shopDetails.shopOwner,
      email: shopDetails.email,
      currencyCode: shopDetails.currencyCode,
    });

    let catalogSync = "ready";
    try {
      await syncTenantShopifyCatalog({
        tenantId: tenant.tenantId,
        appOrigin: request.nextUrl.origin,
      });
    } catch (error) {
      console.error("[shopify callback] initial catalog sync failed:", error);
      catalogSync = "failed";
    }

    const response = NextResponse.redirect(
      new URL(
        `/shopify/installed?shop=${encodeURIComponent(shop)}&catalogSync=${encodeURIComponent(catalogSync)}`,
        request.nextUrl.origin
      )
    );
    response.cookies.delete(SHOPIFY_INSTALL_COOKIE);
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Shopify callback failed." },
      { status: 500 }
    );
  }
}
