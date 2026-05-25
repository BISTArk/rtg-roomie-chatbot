import { redirect } from "next/navigation";
import AdminAnalyticsDashboard from "@/components/AdminAnalyticsDashboard";
import AdminConsoleShell from "@/components/AdminConsoleShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  listTenantAnalyticsSummaries,
  listTenantSessionAnalyticsPage,
  listTenants,
} from "@/lib/tenant-platform";

function isSeededDemoTenant(tenantKey: string): boolean {
  return tenantKey === "shop-assist-demo";
}

function readString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function readArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).filter(Boolean);
  return value ? [String(value)] : [];
}

function clampLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 25;
  if (parsed <= 25) return 25;
  if (parsed <= 50) return 50;
  return 100;
}

function clampPage(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const params: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>));
  const activeTab = readString(params.tab) === "sessions" ? "sessions" : "overview";
  const fromDate = readString(params.from);
  const toDate = readString(params.to);
  const query = readString(params.q).trim();
  const errorsOnly = readString(params.errors) === "1";
  const limit = clampLimit(readString(params.limit));
  const page = clampPage(readString(params.page));
  const requestedTenantIds = readArray(params.tenant);

  let databaseError = "";
  let visibleTenants: Awaited<ReturnType<typeof listTenants>> = [];
  let summaries: Awaited<ReturnType<typeof listTenantAnalyticsSummaries>> = [];
  let sessionPage: Awaited<ReturnType<typeof listTenantSessionAnalyticsPage>> = {
    records: [],
    totalCount: 0,
    limit,
    offset: (page - 1) * limit,
  };
  let selectedTenantIds: string[] = [];

  try {
    const tenants = await listTenants();
    visibleTenants = tenants.filter((tenant) => !isSeededDemoTenant(tenant.tenantKey));

    const visibleTenantIds = new Set(visibleTenants.map((tenant) => tenant.tenantId));
    selectedTenantIds = requestedTenantIds.filter((tenantId) => visibleTenantIds.has(tenantId));
    const hiddenTenantIds = tenants
      .filter((tenant) => !visibleTenantIds.has(tenant.tenantId))
      .map((tenant) => tenant.tenantId);
    const baseFilters = {
      tenantIds: selectedTenantIds.length > 0 ? selectedTenantIds : undefined,
      excludedTenantIds: selectedTenantIds.length === 0 ? hiddenTenantIds : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    };

    const [summaryRows, sessionRows] = await Promise.all([
      listTenantAnalyticsSummaries(baseFilters),
      listTenantSessionAnalyticsPage({
        ...baseFilters,
        query: activeTab === "sessions" ? query : undefined,
        errorsOnly: activeTab === "sessions" ? errorsOnly : false,
        limit,
        offset: (page - 1) * limit,
      }),
    ]);

    summaries = summaryRows;
    sessionPage = sessionRows;
  } catch (error) {
    databaseError =
      error instanceof Error
        ? error.message
        : "Could not connect to the configured Postgres database.";
  }

  return (
    <AdminConsoleShell
      activeSection="analytics"
      title="Analytics"
      description="Track tenant usage, review recent sessions, and filter analytics from the server side."
    >
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
              Admin login worked, but analytics could not be loaded from Postgres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm">{databaseError}</p>
            <p className="text-sm">
              Start the configured Postgres instance or update `DATABASE_URL`, then refresh this page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AdminAnalyticsDashboard
          activeTab={activeTab}
          summaries={summaries}
          sessionPage={sessionPage}
          tenantOptions={visibleTenants.map((tenant) => ({
            tenantId: tenant.tenantId,
            tenantKey: tenant.tenantKey,
            tenantName: tenant.name,
          }))}
          filters={{
            tenantIds: selectedTenantIds,
            fromDate,
            toDate,
            query,
            errorsOnly,
            limit,
            page,
          }}
        />
      )}
    </AdminConsoleShell>
  );
}