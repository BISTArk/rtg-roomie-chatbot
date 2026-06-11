import { NextRequest } from "next/server";
import { getShopifyAppConfig } from "@/lib/shopify";
import {
  getShopDomainFromSessionToken,
  verifyShopifySessionToken,
} from "@/lib/shopify-session-token";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return Response.json({ error: "Missing Shopify session token." }, { status: 401 });
  }

  try {
    const config = getShopifyAppConfig(request.nextUrl.origin);
    const payload = verifyShopifySessionToken({
      token,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    });

    return Response.json({
      ok: true,
      shop: getShopDomainFromSessionToken(payload),
      userId: payload.sub,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid Shopify session token.",
      },
      { status: 401 }
    );
  }
}
