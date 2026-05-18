import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { normalizeShopifyShopDomain } from "@/lib/shopify";
import { getTenantByShopifyShopDomain } from "@/lib/tenant-platform";

export default async function ShopifyInstalledPage({
  searchParams,
}: {
  searchParams?: Promise<{ shop?: string; catalogSync?: string }>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as {
    shop?: string;
    catalogSync?: string;
  };
  const shop = normalizeShopifyShopDomain(params.shop) || "your Shopify store";
  const catalogSync = params.catalogSync || "";
  const adminAuthenticated = await isAdminAuthenticated();
  const tenant = adminAuthenticated && shop !== "your Shopify store"
    ? await getTenantByShopifyShopDomain(shop)
    : null;
  const tenantKey = tenant?.tenantKey || "";
  const shopifyApiKey = process.env.SHOPIFY_API_KEY?.trim() || "";
  const enableEmbedUrl =
    shopifyApiKey && shop && shop !== "your Shopify store"
      ? `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${encodeURIComponent(shopifyApiKey)}/shop-assist`
      : "";

  return (
    <main className="min-h-screen px-6 py-10" style={{ background: "var(--widget-surface-alt)" }}>
      <div
        className="mx-auto max-w-3xl rounded-3xl border p-8"
        style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
      >
        <h1 className="text-3xl font-semibold" style={{ color: "var(--widget-text)" }}>
          Shopify app installed
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
          {shop} installed the Shopify app successfully.
        </p>
        {catalogSync === "ready" ? (
          <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            Your product catalog connected successfully.
          </p>
        ) : null}
        {catalogSync === "failed" ? (
          <p className="mt-3 text-sm" style={{ color: "#b45309" }}>
            The app installed successfully, but setup is still finishing in the background. If the widget does not appear after enabling it, contact support.
          </p>
        ) : null}
        {enableEmbedUrl ? (
          <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            Next, enable the chatbot app embed in the theme editor.
          </p>
        ) : null}
        <div className="mt-6 space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
          <div>Shop: {shop}</div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {enableEmbedUrl ? (
            <a
              href={enableEmbedUrl}
              className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}
            >
              Enable chatbot in theme editor
            </a>
          ) : null}
          {adminAuthenticated ? (
            <Link
              href="/admin"
              className={`rounded-2xl px-4 py-3 text-sm font-semibold${enableEmbedUrl ? " border" : ""}`}
              style={
                enableEmbedUrl
                  ? { borderColor: "var(--widget-border)", color: "var(--widget-text)" }
                  : { background: "var(--widget-accent)", color: "var(--widget-accent-text)" }
              }
            >
              Open admin
            </Link>
          ) : null}
          {adminAuthenticated && tenantKey ? (
            <Link
              href={`/embed?tenantKey=${encodeURIComponent(tenantKey)}`}
              className="rounded-2xl border px-4 py-3 text-sm font-semibold"
              style={{ borderColor: "var(--widget-border)", color: "var(--widget-text)" }}
            >
              Preview embed shell
            </Link>
          ) : null}
        </div>
        {adminAuthenticated ? (
          <div className="mt-6 rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--widget-border)", color: "var(--widget-text-muted)" }}>
            <p>Internal setup view.</p>
            <p className="mt-2">Tenant key: {tenantKey || "(no tenant found)"}</p>
            <p className="mt-2">Use admin if you need to inspect tenant mapping or run a manual sync.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
