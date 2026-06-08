import type { NextRequest } from "next/server";
import {
  handleShopifyCustomerDataRequest,
  handleShopifyCustomerRedact,
  handleShopifyShopRedact,
  type ShopifyCustomerDataRequestPayload,
  type ShopifyCustomerRedactPayload,
  type ShopifyShopRedactPayload,
} from "@/lib/shopify-compliance";
import { readVerifiedShopifyWebhook } from "@/lib/shopify-webhook";

export async function POST(request: NextRequest) {
  const verified = await readVerifiedShopifyWebhook(request);
  if (!verified.ok) {
    if (verified.status === 401) {
      return Response.json({ error: "Invalid Shopify webhook signature." }, { status: 401 });
    }
    return Response.json({ error: "Invalid Shopify webhook request." }, { status: 400 });
  }

  try {
    switch (verified.topic) {
      case "customers/data_request":
        await handleShopifyCustomerDataRequest(verified.payload as ShopifyCustomerDataRequestPayload);
        break;
      case "customers/redact":
        await handleShopifyCustomerRedact(verified.payload as ShopifyCustomerRedactPayload);
        break;
      case "shop/redact":
        await handleShopifyShopRedact(verified.payload as ShopifyShopRedactPayload);
        break;
      default:
        return Response.json({ error: `Unsupported Shopify webhook topic: ${verified.topic}` }, { status: 404 });
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("[shopify compliance webhook]", verified.topic, error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to process Shopify compliance webhook." },
      { status: 500 }
    );
  }
}
