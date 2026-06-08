import type { NextRequest } from "next/server";
import {
  getShopifyAppConfig,
  normalizeShopifyShopDomain,
  verifyShopifyWebhookSignature,
} from "@/lib/shopify";

export type VerifiedShopifyWebhook =
  | { ok: false; status: 401 | 400 }
  | {
      ok: true;
      topic: string;
      shop: string;
      payload: Record<string, unknown>;
      webhookId: string | null;
    };

export async function readVerifiedShopifyWebhook(
  request: NextRequest
): Promise<VerifiedShopifyWebhook> {
  const rawBody = await request.text();

  try {
    const config = getShopifyAppConfig(request.nextUrl.origin);
    const isValid = verifyShopifyWebhookSignature({
      rawBody,
      hmacHeader: request.headers.get("x-shopify-hmac-sha256"),
      secret: config.apiSecret,
    });
    if (!isValid) {
      return { ok: false, status: 401 };
    }

    const shop = normalizeShopifyShopDomain(request.headers.get("x-shopify-shop-domain"));
    if (!shop) {
      return { ok: false, status: 400 };
    }

    const topic = String(request.headers.get("x-shopify-topic") || "").trim();
    if (!topic) {
      return { ok: false, status: 400 };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, status: 400 };
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, status: 400 };
    }

    return {
      ok: true,
      topic,
      shop,
      payload: payload as Record<string, unknown>,
      webhookId: request.headers.get("x-shopify-webhook-id"),
    };
  } catch (error) {
    console.error("[shopify webhook] verification failed:", error);
    return { ok: false, status: 401 };
  }
}
