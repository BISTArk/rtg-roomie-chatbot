import { NextRequest, NextResponse } from "next/server";
import {
  buildShopifyAuthUrl,
  createShopifyInstallState,
  getShopifyAppConfig,
  normalizeShopifyShopDomain,
} from "@/lib/shopify";

const SHOPIFY_INSTALL_COOKIE = "shop_assist_shopify_install_state";

export async function GET(request: NextRequest) {
  try {
    const shop = normalizeShopifyShopDomain(request.nextUrl.searchParams.get("shop"));
    if (!shop) {
      return Response.json(
        { error: "A valid Shopify shop domain is required, for example store-name.myshopify.com." },
        { status: 400 }
      );
    }

    const config = getShopifyAppConfig(request.nextUrl.origin);
    const state = createShopifyInstallState(shop, config.apiSecret);
    const response = NextResponse.redirect(
      buildShopifyAuthUrl({ shop, state, config })
    );
    response.cookies.set(SHOPIFY_INSTALL_COOKIE, state, {
      httpOnly: true,
      sameSite: request.nextUrl.protocol === "https:" ? "none" : "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 10,
    });
    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Shopify install failed." },
      { status: 500 }
    );
  }
}
