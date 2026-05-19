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
    const cookieState = request.cookies.get(SHOPIFY_INSTALL_COOKIE)?.value;

    if (!shop || !code || !state) {
      return Response.json({ error: "Shopify callback is missing required parameters." }, { status: 400 });
    }

    if (!verifyShopifyCallbackHmac(request.nextUrl.searchParams, config.apiSecret)) {
      return Response.json({ error: "Invalid Shopify callback signature." }, { status: 401 });
    }

    const verifiedState = verifyShopifyInstallState(state, config.apiSecret);
    const verifiedCookieState = verifyShopifyInstallState(cookieState, config.apiSecret);
    if (!verifiedState || !verifiedCookieState || cookieState !== state) {
      return Response.json({ error: "Shopify install state validation failed." }, { status: 401 });
    }

    if (verifiedState.shop !== shop) {
      console.warn(
        `[shopify callback] callback shop ${shop} differed from requested shop ${verifiedState.shop}; continuing with Shopify canonical domain.`
      );
    }

    const token = await exchangeShopifyCodeForAccessToken({ shop, code, config });
    let shopDetails: {
      myshopifyDomain: string;
      name: string;
      primaryDomainHost?: string | null;
      shopOwner?: string | null;
      email?: string | null;
      currencyCode?: string | null;
    };

    try {
      const fetched = await fetchShopifyShopDetails({
        shop,
        accessToken: token.accessToken,
        config,
      });
      shopDetails = {
        myshopifyDomain: fetched.myshopifyDomain,
        name: fetched.name,
        primaryDomainHost: fetched.primaryDomainHost,
        shopOwner: fetched.shopOwner,
        email: fetched.email,
        currencyCode: fetched.currencyCode,
      };
    } catch (error) {
      console.error("[shopify callback] failed to fetch shop details, continuing with fallback values:", error);
      shopDetails = {
        myshopifyDomain: shop,
        name: shop.replace(/\.myshopify\.com$/, "") || shop,
        primaryDomainHost: null,
        shopOwner: null,
        email: null,
        currencyCode: null,
      };
    }

    const tenant = await upsertTenantFromShopifyInstall({
      shopDomain: shopDetails.myshopifyDomain,
      storefrontDomain: shopDetails.primaryDomainHost,
      additionalDomains: [verifiedState.shop, shop],
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
