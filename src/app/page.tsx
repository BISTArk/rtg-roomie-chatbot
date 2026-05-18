import { redirect } from "next/navigation";
import { ChatWidget } from "@/components/ChatWidget";
import { MockContextPanel } from "@/components/MockContextPanel";
import { normalizeShopifyShopDomain } from "@/lib/shopify";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ shop?: string }>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as {
    shop?: string;
  };
  const shop = normalizeShopifyShopDomain(params.shop);

  if (shop) {
    const tenant = await getTenantByShopifyShopDomain(shop);

    if (!tenant?.shopifyInstallation || tenant.shopifyInstallation.status !== "installed") {
      redirect(`/api/shopify/install?shop=${encodeURIComponent(shop)}`);
    }

    redirect(
      `/shopify/installed?shop=${encodeURIComponent(shop)}`
    );
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center"
      style={{ backgroundColor: "var(--widget-surface-alt)" }}
    >
      <div className="text-center">
        <h1
          className="text-3xl font-bold"
          style={{ color: "var(--widget-text)" }}
        >
          Storefront Demo
        </h1>
        <p
          className="mt-2 text-base"
          style={{ color: "var(--widget-text-muted)" }}
        >
          Demo page — the shopping assistant widget is in the bottom-right corner
        </p>
      </div>

      <MockContextPanel />

      <ChatWidget />
    </main>
  );
}
