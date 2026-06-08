import type { NextRequest } from "next/server";
import { markShopifyInstallationUninstalled } from "@/lib/tenant-platform";
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
    await markShopifyInstallationUninstalled(verified.shop);
    return new Response(null, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to process Shopify uninstall webhook." },
      { status: 500 }
    );
  }
}
