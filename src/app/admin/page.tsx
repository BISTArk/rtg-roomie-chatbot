import { redirect } from "next/navigation";
import AdminTenantCreateForm from "@/components/AdminTenantCreateForm";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getTenantDebugSnapshot,
  listCatalogSources,
  listCatalogVersions,
  listTenants,
} from "@/lib/tenant-platform";

function getShopifyConnectDomain(domains: string[]): string {
  return domains.find((domain) => domain.endsWith(".myshopify.com")) || "";
}

function isSeededDemoTenant(tenantKey: string): boolean {
  return tenantKey === "shop-assist-demo";
}

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  let tenantDetails: Array<{
    tenant: Awaited<ReturnType<typeof listTenants>>[number];
    sources: Awaited<ReturnType<typeof listCatalogSources>>;
    versions: Awaited<ReturnType<typeof listCatalogVersions>>;
    debug: Awaited<ReturnType<typeof getTenantDebugSnapshot>>;
  }> = [];
  let databaseError = "";

  try {
    const tenants = await listTenants();
    tenantDetails = await Promise.all(
      tenants.map(async (tenant) => ({
        tenant,
        sources: await listCatalogSources(tenant.tenantId),
        versions: await listCatalogVersions(tenant.tenantId),
        debug: await getTenantDebugSnapshot(tenant.tenantId),
      }))
    );
  } catch (error) {
    databaseError =
      error instanceof Error
        ? error.message
        : "Could not connect to the configured Postgres database.";
  }

  const visibleTenantDetails = tenantDetails.filter(
    ({ tenant }) => !isSeededDemoTenant(tenant.tenantKey)
  );
  const hiddenDemoTenantCount = tenantDetails.length - visibleTenantDetails.length;

  return (
    <main className="min-h-screen px-6 py-10" style={{ background: "var(--widget-surface-alt)" }}>
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: "var(--widget-text)" }}>
              Multi-Tenant Admin
            </h1>
            <p className="mt-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
              Internal console for tenant setup, Shopify catalog sync, domain management, and active catalog snapshots.
            </p>
          </div>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="rounded-2xl border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--widget-border)", color: "var(--widget-text)" }}
            >
              Log out
            </button>
          </form>
        </div>

        {databaseError ? (
          <section
            className="rounded-3xl border p-6"
            style={{
              background: "#fff7ed",
              borderColor: "#fdba74",
              color: "#7c2d12",
            }}
          >
            <h2 className="text-xl font-semibold">Database Setup Needed</h2>
            <p className="mt-2 text-sm">
              Admin login worked, but the page could not reach Postgres, so tenant data could not be loaded.
            </p>
            <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm">
              {databaseError}
            </p>
            <p className="mt-3 text-sm">
              Your current `.env.local` points `DATABASE_URL` at local Postgres. Start that database or replace it with a real Postgres connection string, then refresh this page. Until that connection works, the tenant list and create flow cannot load real tenant data.
            </p>
          </section>
        ) : null}

        <section
          className="rounded-3xl border p-6"
          style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
        >
          <h2 className="text-xl font-semibold">Create Tenant</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            Manual creation stays available for internal setup. Merchants should install through Shopify&apos;s Custom Distribution link; this admin screen is only for your team.
          </p>
          <AdminTenantCreateForm />
        </section>

        <section
          className="rounded-3xl border p-6"
          style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
        >
          <h2 className="text-xl font-semibold">Shopify flow</h2>
          <div className="mt-2 space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            <p>1. Merchant installs with the Shopify Custom Distribution URL from the Partner Dashboard.</p>
            <p>2. After install, your team opens this admin page to confirm the tenant and run the first Shopify catalog sync.</p>
            <p>3. Then enable the Theme App Embed in the merchant&apos;s theme editor.</p>
            <p>Do not send merchants the internal `/api/shopify/install?shop=...` route.</p>
          </div>
        </section>

        {hiddenDemoTenantCount > 0 ? (
          <section
            className="rounded-3xl border p-6"
            style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
          >
            <h2 className="text-xl font-semibold">Internal demo tenant</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
              The seeded `shop-assist-demo` tenant is hidden from the merchant tenant list so it does not get confused with real Shopify stores.
            </p>
          </section>
        ) : null}

        {!databaseError && visibleTenantDetails.length === 0 ? (
          <section
            className="rounded-3xl border p-6"
            style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
          >
            <h2 className="text-xl font-semibold">Tenants</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
              No merchant tenants are showing yet. Try refreshing after the database comes up or after your first Shopify store is connected.
            </p>
          </section>
        ) : null}

        {visibleTenantDetails.map(({ tenant, sources, versions, debug }) => (
          (() => {
            const shopifyConnectDomain = getShopifyConnectDomain(tenant.allowedDomains);
            const shopifySource = sources.find((source) => source.type === "shopify");
            return (
          <section
            key={tenant.tenantId}
            className="rounded-3xl border p-6"
            style={{ background: "var(--widget-surface)", borderColor: "var(--widget-border)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">{tenant.name}</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                  `tenantKey`: {tenant.tenantKey} | namespace: {tenant.storageNamespace}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                  Domains: {tenant.allowedDomains.join(", ") || "(none yet)"}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                  Shopify: {tenant.shopifyInstallation ? `${tenant.shopifyInstallation.shopDomain} (${tenant.shopifyInstallation.status})` : "Not connected yet"}
                </p>
              </div>
              <div className="text-sm" style={{ color: "var(--widget-text-muted)" }}>
                <div>Conversations: {debug.conversations.length}</div>
                <div>Shares: {debug.shares.length}</div>
                <div>Catalog versions: {versions.length}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <form action={`/api/admin/tenants/${tenant.tenantId}`} method="post" className="space-y-3 rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                <h3 className="font-semibold">Update tenant config</h3>
                <input name="name" defaultValue={tenant.name} className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="appName" defaultValue={tenant.appName} className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="appUrl" defaultValue={tenant.appUrl} className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="assistantName" defaultValue={tenant.branding.assistantName || ""} placeholder="Assistant name" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="headerTitle" defaultValue={tenant.branding.headerTitle || ""} placeholder="Header title" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="launcherLabel" defaultValue={tenant.branding.launcherLabel || ""} placeholder="Launcher label" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="inputPlaceholder" defaultValue={tenant.branding.inputPlaceholder || ""} placeholder="Input placeholder" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="supportUrl" defaultValue={tenant.prompt.supportUrl || ""} placeholder="Support URL" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="storeLocatorUrl" defaultValue={tenant.prompt.storeLocatorUrl || ""} placeholder="Store locator URL" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="handoffDescription" defaultValue={tenant.prompt.handoffDescription || ""} placeholder="Handoff description" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <textarea name="businessSummary" defaultValue={tenant.aiConfig.businessSummary || ""} placeholder="Business summary" className="min-h-24 w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="brandVoice" defaultValue={tenant.aiConfig.brandVoice || ""} placeholder="Brand voice" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <input name="targetAudience" defaultValue={tenant.aiConfig.targetAudience || ""} placeholder="Target audience" className="w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <textarea name="salesPolicy" defaultValue={tenant.aiConfig.salesPolicy || ""} placeholder="Sales policy" className="min-h-20 w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <textarea name="supportPolicy" defaultValue={tenant.aiConfig.supportPolicy || ""} placeholder="Support policy" className="min-h-20 w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <textarea name="extraInstructions" defaultValue={tenant.aiConfig.extraInstructions || ""} placeholder="Extra AI instructions" className="min-h-28 w-full rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                <button type="submit" className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}>
                  Save config
                </button>
              </form>

              <div className="space-y-4">
                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                  <h3 className="font-semibold">Shopify status</h3>
                  {tenant.shopifyInstallation ? (
                    <div className="mt-3 space-y-3">
                      <div className="space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                        <div>Shop domain: {tenant.shopifyInstallation.shopDomain}</div>
                        <div>Storefront domain: {tenant.shopifyInstallation.storefrontDomain || "(not captured yet)"}</div>
                        <div>Status: {tenant.shopifyInstallation.status}</div>
                        <div>Scopes: {tenant.shopifyInstallation.scopes.join(", ") || "(none recorded)"}</div>
                      </div>
                      {sources.find((source) => source.type === "shopify") ? (
                        <form action={`/api/admin/tenants/${tenant.tenantId}/catalog/sync`} method="post">
                          <input
                            type="hidden"
                            name="sourceId"
                            value={sources.find((source) => source.type === "shopify")?.id || ""}
                          />
                          <button type="submit" className="rounded-2xl border px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--widget-border)" }}>
                            Sync Shopify catalog
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                      <p>
                        This tenant is not linked to a Shopify OAuth/access record yet. Merchant install alone does not give this backend the access token needed for catalog sync.
                      </p>
                      {shopifyConnectDomain ? (
                        <a
                          href={`/api/shopify/install?shop=${encodeURIComponent(shopifyConnectDomain)}`}
                          className="inline-flex rounded-2xl border px-3 py-2 text-sm font-medium"
                          style={{ borderColor: "var(--widget-border)", color: "var(--widget-text)" }}
                        >
                          Connect Shopify access
                        </a>
                      ) : null}
                      <p>
                        After that access step completes, the app will auto-sync the first Shopify catalog snapshot.
                      </p>
                    </div>
                  )}
                </div>

                <form action={`/api/admin/tenants/${tenant.tenantId}/domains`} method="post" className="rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                  <h3 className="font-semibold">Add allowed domain</h3>
                  <div className="mt-3 flex gap-3">
                    <input name="hostname" placeholder="shop.client.com" className="min-w-0 flex-1 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <button type="submit" className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}>
                      Add
                    </button>
                  </div>
                </form>

                <form action={`/api/admin/tenants/${tenant.tenantId}/catalog/excel`} method="post" encType="multipart/form-data" className="rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                  <h3 className="font-semibold">Import Excel catalog</h3>
                  <div className="mt-3 grid gap-3">
                    <input name="sourceName" placeholder="Source label" className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <input name="sheetName" placeholder="Upload sheet" className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <input name="file" type="file" accept=".xlsx,.xls" className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <button type="submit" className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}>
                      Upload and activate
                    </button>
                  </div>
                </form>

                <form action={`/api/admin/tenants/${tenant.tenantId}/catalog/postgres-source`} method="post" className="rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                  <h3 className="font-semibold">Add Postgres catalog source</h3>
                  <div className="mt-3 grid gap-3">
                    <input name="name" placeholder="Source name" className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <input name="connectionString" placeholder="postgres://..." className="rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <textarea name="queryText" placeholder="SELECT * FROM catalog_products" className="min-h-28 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--widget-border)" }} />
                    <button type="submit" className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}>
                      Save source
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                <h3 className="font-semibold">Catalog sources</h3>
                <div className="mt-3 space-y-3">
                  {sources.length === 0 ? (
                    <div className="space-y-3 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                      <p>No sources yet.</p>
                      {!tenant.shopifyInstallation && shopifyConnectDomain ? (
                        <>
                          <p>
                            That is why the lower sync button is missing: the sync button only appears after Shopify access has been connected and a Shopify catalog source exists.
                          </p>
                          <a
                            href={`/api/shopify/install?shop=${encodeURIComponent(shopifyConnectDomain)}`}
                            className="inline-flex rounded-2xl border px-3 py-2 text-sm font-medium"
                            style={{ borderColor: "var(--widget-border)", color: "var(--widget-text)" }}
                          >
                            Connect Shopify access
                          </a>
                        </>
                      ) : null}
                      {tenant.shopifyInstallation && !shopifySource ? (
                        <p>
                          Shopify access is connected, but no Shopify catalog source is available yet. Refresh after the callback completes, or reconnect Shopify access if this persists.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    sources.map((source) => (
                      <div key={source.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--widget-border)" }}>
                        <div className="font-medium">{source.name}</div>
                        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--widget-text-muted)" }}>
                          {source.type}
                        </div>
                        {source.type === "postgres" || source.type === "shopify" ? (
                          <form action={`/api/admin/tenants/${tenant.tenantId}/catalog/sync`} method="post" className="mt-3">
                            <input type="hidden" name="sourceId" value={source.id} />
                            <button type="submit" className="rounded-2xl border px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--widget-border)" }}>
                              {source.type === "shopify" ? "Sync Shopify catalog" : "Sync and activate"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
                <h3 className="font-semibold">Catalog versions</h3>
                <div className="mt-3 space-y-3">
                  {versions.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--widget-text-muted)" }}>
                      No versions yet.
                    </p>
                  ) : (
                    versions.map((version) => (
                      <div key={version.id} className="rounded-2xl border p-3" style={{ borderColor: version.isActive ? "var(--widget-accent)" : "var(--widget-border)" }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{version.label}</div>
                            <div className="text-xs" style={{ color: "var(--widget-text-muted)" }}>
                              {version.sourceType} | {version.rowCount} rows
                            </div>
                          </div>
                          {version.isActive ? (
                            <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--widget-accent)", color: "var(--widget-accent-text)" }}>
                              Active
                            </span>
                          ) : (
                            <form action={`/api/admin/catalog-versions/${version.id}/activate`} method="post">
                              <input type="hidden" name="tenantId" value={tenant.tenantId} />
                              <button type="submit" className="rounded-2xl border px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--widget-border)" }}>
                                Activate
                              </button>
                            </form>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)" }}>
              <h3 className="font-semibold">Recent debug activity</h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm font-medium">Sessions</div>
                  <ul className="mt-2 space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                    {debug.conversations.length === 0 ? <li>No sessions yet.</li> : debug.conversations.map((item) => (
                      <li key={item.sessionId}>{item.sessionId} · {new Date(item.updatedAt).toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-sm font-medium">Share links</div>
                  <ul className="mt-2 space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
                    {debug.shares.length === 0 ? <li>No shares yet.</li> : debug.shares.map((item) => (
                      <li key={item.id}>{item.id} · expires {new Date(item.expiresAt).toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
            );
          })()
        ))}
      </div>
    </main>
  );
}
