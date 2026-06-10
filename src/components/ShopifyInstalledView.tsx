import Link from "next/link";

export function ShopifyInstalledView({
  shop,
  catalogSync,
  catalogSyncError,
  adminAuthenticated,
  tenantKey,
  enableEmbedUrl,
  reinstallUrl,
  resyncCatalogUrl,
}: {
  shop: string;
  catalogSync?: string;
  catalogSyncError?: string;
  adminAuthenticated: boolean;
  tenantKey?: string;
  enableEmbedUrl: string;
  reinstallUrl?: string;
  resyncCatalogUrl?: string;
}) {
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
          <div className="mt-3 space-y-2 text-sm" style={{ color: "#b45309" }}>
            <p>
              Product catalog sync failed. This usually means the Shopify access token is missing,
              invalid, or was created before the app credentials were corrected.
            </p>
            {catalogSyncError ? (
              <p className="rounded-xl border px-3 py-2 font-mono text-xs" style={{ borderColor: "#f59e0b", color: "#92400e" }}>
                {catalogSyncError}
              </p>
            ) : null}
            {reinstallUrl ? (
              <p>
                Reconnect the app to refresh API access, then retry catalog sync.
              </p>
            ) : null}
          </div>
        ) : null}
        {catalogSync === "pending" ? (
          <p className="mt-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            Connecting your product catalog in the background...
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
          {reinstallUrl ? (
            <a
              href={reinstallUrl}
              target="_top"
              rel="noreferrer"
              className="rounded-2xl border px-4 py-3 text-sm font-semibold"
              style={{ borderColor: "var(--widget-border)", color: "var(--widget-text)" }}
            >
              Reconnect Shopify
            </a>
          ) : null}
          {resyncCatalogUrl && catalogSync !== "ready" ? (
            <a
              href={resyncCatalogUrl}
              target="_top"
              rel="noreferrer"
              className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}
            >
              Sync product catalog
            </a>
          ) : null}
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
