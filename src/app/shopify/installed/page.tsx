import Link from "next/link";

export default async function ShopifyInstalledPage({
  searchParams,
}: {
  searchParams?: Promise<{ shop?: string; tenantKey?: string; catalogSync?: string }>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as {
    shop?: string;
    tenantKey?: string;
    catalogSync?: string;
  };
  const shop = params.shop || "your Shopify store";
  const tenantKey = params.tenantKey || "";
  const catalogSync = params.catalogSync || "";
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
          {shop} installed the Shopify app successfully. This page is for your internal setup steps after merchant install: confirm the tenant mapping, sync the store catalog, and enable the Theme App Embed.
        </p>
        <div className="mt-4 rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--widget-border)", color: "var(--widget-text-muted)" }}>
          <p>
            Merchant-facing install link: use Shopify&apos;s Custom Distribution install URL from the Partner Dashboard.
          </p>
          <p className="mt-2">
            Internal-only links: this page, the admin dashboard, and any manual `/api/shopify/install?shop=...` route are for setup/debugging only.
          </p>
        </div>
        {catalogSync === "ready" ? (
          <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            Initial Shopify catalog sync completed automatically.
          </p>
        ) : null}
        {catalogSync === "failed" ? (
          <p className="mt-3 text-sm" style={{ color: "#b45309" }}>
            The app installed successfully, but the initial catalog sync did not complete. Open admin to run the Shopify catalog sync manually.
          </p>
        ) : null}
        {enableEmbedUrl ? (
          <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            Next, enable the chatbot app embed for this store in the theme editor.
          </p>
        ) : null}
        <div className="mt-6 space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
          <div>Shop: {shop}</div>
          <div>Tenant key: {tenantKey || "(created without a visible tenant key)"}</div>
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
          <Link
            href="/admin"
            className={`rounded-2xl px-4 py-3 text-sm font-semibold${enableEmbedUrl ? " border" : ""}`}
            style={
              enableEmbedUrl
                ? { borderColor: "var(--widget-border)", color: "var(--widget-text)" }
                : { background: "var(--widget-accent)", color: "var(--widget-accent-text)" }
            }
          >
            Open admin to sync catalog
          </Link>
          {tenantKey ? (
            <Link
              href={`/embed?tenantKey=${encodeURIComponent(tenantKey)}`}
              className="rounded-2xl border px-4 py-3 text-sm font-semibold"
              style={{ borderColor: "var(--widget-border)", color: "var(--widget-text)" }}
            >
              Preview embed shell
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
