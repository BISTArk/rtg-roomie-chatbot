import type { NextRequest } from "next/server";
import { after } from "next/server";
import {
  isShopifyProductCatalogWebhookTopic,
  requestShopifyCatalogSyncFromWebhook,
  runDebouncedShopifyCatalogSyncFromWebhook,
} from "@/lib/shopify-catalog-sync";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";
import { readVerifiedShopifyWebhook } from "@/lib/shopify-webhook";

export async function POST(request: NextRequest) {
  const verified = await readVerifiedShopifyWebhook(request);
  if (!verified.ok) {
    if (verified.status === 401) {
      return Response.json({ error: "Invalid Shopify webhook signature." }, { status: 401 });
    }
    return Response.json({ error: "Invalid Shopify webhook request." }, { status: 400 });
  }

  if (!isShopifyProductCatalogWebhookTopic(verified.topic)) {
    return Response.json(
      { error: `Unsupported Shopify webhook topic: ${verified.topic}` },
      { status: 404 }
    );
  }

  const tenant = await getTenantByShopifyShopDomain(verified.shop);
  if (!tenant?.shopifyInstallation || tenant.shopifyInstallation.status !== "installed") {
    return new Response(null, { status: 200 });
  }

  const marked = await requestShopifyCatalogSyncFromWebhook(tenant.tenantId);
  if (!marked) {
    console.warn(
      "[shopify catalog webhook] no Shopify catalog source for tenant",
      tenant.tenantKey,
      verified.shop
    );
    return new Response(null, { status: 200 });
  }

  const appOrigin = request.nextUrl.origin;
  const tenantId = tenant.tenantId;
  const topic = verified.topic;
  const webhookId = verified.webhookId;

  after(async () => {
    try {
      await runDebouncedShopifyCatalogSyncFromWebhook({
        tenantId,
        appOrigin,
        topic,
        webhookId,
      });
    } catch (error) {
      console.error("[shopify catalog webhook] background sync failed:", error);
    }
  });

  return new Response(null, { status: 200 });
}
