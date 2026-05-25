import { redirect } from "next/navigation";
import AdminAnalyticsDashboard from "@/components/AdminAnalyticsDashboard";
import AdminCreateTenantDialog from "@/components/AdminCreateTenantDialog";
import AdminTenantWorkbench from "@/components/AdminTenantWorkbench";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getTenantDebugSnapshot,
  listRecentTenantSessionAnalytics,
  listTenantAnalyticsSummaries,
  listCatalogSources,
  listCatalogVersions,
  listTenants,
} from "@/lib/tenant-platform";

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
  let analyticsSummaries: Awaited<ReturnType<typeof listTenantAnalyticsSummaries>> = [];
  let recentAnalyticsSessions: Awaited<ReturnType<typeof listRecentTenantSessionAnalytics>> = [];
  let databaseError = "";

  try {
    const tenants = await listTenants();
    const [details, summaries, sessions] = await Promise.all([
      Promise.all(
        tenants.map(async (tenant) => ({
          tenant,
          sources: await listCatalogSources(tenant.tenantId),
          versions: await listCatalogVersions(tenant.tenantId),
          debug: await getTenantDebugSnapshot(tenant.tenantId),
        }))
      ),
      listTenantAnalyticsSummaries(),
      listRecentTenantSessionAnalytics(40),
    ]);
    tenantDetails = details;
    analyticsSummaries = summaries;
    recentAnalyticsSessions = sessions;
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
  const visibleTenantIds = new Set(visibleTenantDetails.map(({ tenant }) => tenant.tenantId));
  const visibleAnalyticsSummaries = analyticsSummaries.filter((summary) => visibleTenantIds.has(summary.tenantId));
  const visibleRecentAnalyticsSessions = recentAnalyticsSessions.filter((session) => visibleTenantIds.has(session.tenantId));

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
            <Button type="submit" variant="outline">
              Log out
            </Button>
          </form>
        </div>

        {databaseError ? (
          <Card
            style={{
              background: "#fff7ed",
              borderColor: "#fdba74",
              color: "#7c2d12",
            }}
          >
            <CardHeader>
              <CardTitle>Database Setup Needed</CardTitle>
              <CardDescription className="text-[inherit] opacity-80">
                Admin login worked, but the page could not reach Postgres, so tenant data could not be loaded.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm">{databaseError}</p>
              <p className="text-sm">
                Your current `.env.local` points `DATABASE_URL` at local Postgres. Start that database or replace it with a real Postgres connection string, then refresh this page. Until that connection works, the tenant list and create flow cannot load real tenant data.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Create Tenant</CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Manual creation stays available for internal setup. Merchants should install through Shopify&apos;s Custom Distribution link; this admin screen is only for your team.
              </CardDescription>
            </div>
            <AdminCreateTenantDialog />
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shopify flow</CardTitle>
            <CardDescription>Internal install and activation checklist for merchant onboarding.</CardDescription>
          </CardHeader>
          <CardContent>
          <div className="space-y-2 text-sm" style={{ color: "var(--widget-text-muted)" }}>
            <p>1. Merchant installs with the Shopify Custom Distribution URL from the Partner Dashboard.</p>
            <p>2. After install, your team opens this admin page to confirm the tenant and run the first Shopify catalog sync.</p>
            <p>3. Then enable the Theme App Embed in the merchant&apos;s theme editor.</p>
            <p>Do not send merchants the internal `/api/shopify/install?shop=...` route.</p>
          </div>
          </CardContent>
        </Card>

        {!databaseError ? (
          <AdminAnalyticsDashboard
            summaries={visibleAnalyticsSummaries}
            recentSessions={visibleRecentAnalyticsSessions}
          />
        ) : null}

        {hiddenDemoTenantCount > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Internal demo tenant</CardTitle>
              <CardDescription>
                The seeded `shop-assist-demo` tenant is hidden from the merchant tenant list so it does not get confused with real Shopify stores.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {!databaseError && visibleTenantDetails.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Tenants</CardTitle>
              <CardDescription>
                No merchant tenants are showing yet. Try refreshing after the database comes up or after your first Shopify store is connected.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {visibleTenantDetails.length > 0 ? <AdminTenantWorkbench tenantDetails={visibleTenantDetails} /> : null}
      </div>
    </main>
  );
}
