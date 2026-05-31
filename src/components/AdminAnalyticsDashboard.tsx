"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import SessionMessagesModal from "@/components/SessionMessagesModal";
import type {
  TenantSessionAnalyticsPage,
  TenantAnalyticsSummary,
  TenantSessionAnalyticsRecord,
} from "@/lib/platform-types";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function TotalsCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-2 p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--widget-text-muted)]">{label}</div>
        <div className="text-2xl font-semibold text-[var(--widget-text)]">{value}</div>
        <div className="text-sm text-[var(--widget-text-muted)]">{helper}</div>
      </CardContent>
    </Card>
  );
}

function tabClass(active: boolean): string {
  return active
    ? "rounded-full border px-4 py-2 text-sm font-medium text-[var(--widget-text)] bg-[var(--widget-surface)] shadow-sm"
    : "rounded-full border px-4 py-2 text-sm font-medium text-[var(--widget-text-muted)] bg-transparent";
}

export default function AdminAnalyticsDashboard({
  activeTab,
  summaries,
  sessionPage,
  tenantOptions,
  filters,
}: {
  activeTab: "overview" | "sessions";
  summaries: TenantAnalyticsSummary[];
  sessionPage: TenantSessionAnalyticsPage;
  tenantOptions: Array<{ tenantId: string; tenantKey: string; tenantName: string }>;
  filters: {
    tenantIds: string[];
    fromDate: string;
    toDate: string;
    query: string;
    errorsOnly: boolean;
    engagedOnly: boolean;
    limit: number;
    page: number;
  };
}) {
  const [selectedSession, setSelectedSession] = useState<TenantSessionAnalyticsRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const totals = summaries.reduce(
    (acc, summary) => ({
      tenants: acc.tenants + 1,
      sessions: acc.sessions + summary.sessionCount,
      engagedSessions: acc.engagedSessions + summary.engagedSessionCount,
      requests: acc.requests + summary.requestCount,
      totalTokens: acc.totalTokens + summary.totalTokens,
      promptTokens: acc.promptTokens + summary.promptTokens,
      completionTokens: acc.completionTokens + summary.completionTokens,
      errors: acc.errors + summary.errorCount,
    }),
    {
      tenants: 0,
      sessions: 0,
      engagedSessions: 0,
      requests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      errors: 0,
    }
  );
  const recentSessions = sessionPage.records;
  const startRow = sessionPage.totalCount === 0 ? 0 : sessionPage.offset + 1;
  const endRow = sessionPage.offset + recentSessions.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, sessionPage.totalCount) / Math.max(1, sessionPage.limit)));

  const buildHref = (overrides: Record<string, string | number | boolean | string[] | null | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      tab: activeTab,
      tenant: filters.tenantIds,
      from: filters.fromDate,
      to: filters.toDate,
      q: filters.query,
      errors: filters.errorsOnly ? "1" : "",
      engaged: filters.engagedOnly ? "1" : "",
      limit: String(filters.limit),
      page: String(filters.page),
      ...overrides,
    };

    Object.entries(merged).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.filter(Boolean).forEach((item) => params.append(key, item));
        return;
      }
      if (value === null || value === undefined) return;
      if (typeof value === "boolean") {
        if (value) params.set(key, "1");
        return;
      }
      const text = String(value).trim();
      if (!text) return;
      params.set(key, text);
    });

    const queryString = params.toString();
    return queryString ? `/admin/analytics?${queryString}` : "/admin/analytics";
  };

  const outlineLinkClass =
    "inline-flex items-center justify-center rounded-2xl border px-4 py-2 text-sm font-medium transition-colors";
  const buildExportHref = (format: "csv" | "xlsx", engagedOnly: boolean) =>
    buildHref({
      tab: undefined,
      page: undefined,
      limit: undefined,
      engaged: engagedOnly ? "1" : "",
      format,
    }).replace("/admin/analytics", "/api/admin/analytics/export");

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
          <CardDescription>
            Database-backed usage across tenants, with overview totals plus a server-filtered session table.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Link href={buildHref({ tab: "overview", page: 1 })} className={tabClass(activeTab === "overview")} style={{ borderColor: "var(--widget-border)" }}>
              Overview
            </Link>
            <Link href={buildHref({ tab: "sessions", page: 1 })} className={tabClass(activeTab === "sessions")} style={{ borderColor: "var(--widget-border)" }}>
              Sessions
            </Link>
          </div>

          <form action="/admin/analytics" method="get" className="space-y-4 rounded-2xl border p-4" style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface-alt)" }}>
          <input type="hidden" name="tab" value={activeTab} />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-2 xl:col-span-2">
              <span className="text-sm font-medium text-[var(--widget-text)]">Tenants</span>
              <select
                name="tenant"
                multiple
                defaultValue={filters.tenantIds}
                className="min-h-36 w-full rounded-2xl border px-3 py-2 text-sm text-[var(--widget-text)]"
                style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)" }}
              >
                {tenantOptions.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.tenantName} ({tenant.tenantKey})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--widget-text)]">From</span>
              <input
                type="date"
                name="from"
                defaultValue={filters.fromDate}
                className="w-full rounded-2xl border px-3 py-2 text-sm text-[var(--widget-text)]"
                style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)" }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--widget-text)]">To</span>
              <input
                type="date"
                name="to"
                defaultValue={filters.toDate}
                className="w-full rounded-2xl border px-3 py-2 text-sm text-[var(--widget-text)]"
                style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)" }}
              />
            </label>

            <label className="space-y-2 xl:col-span-2">
              <span className="text-sm font-medium text-[var(--widget-text)]">Session / Host Search</span>
              <input
                type="text"
                name="q"
                defaultValue={filters.query}
                placeholder="Session ID, host, tenant name..."
                className="w-full rounded-2xl border px-3 py-2 text-sm text-[var(--widget-text)]"
                style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)" }}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--widget-text)]">
              <input type="checkbox" name="errors" value="1" defaultChecked={filters.errorsOnly} />
              Errors only
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--widget-text)]">
              <input type="checkbox" name="engaged" value="1" defaultChecked={filters.engagedOnly} />
              Engaged only
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--widget-text)]">
              <span>Rows</span>
              <select
                name="limit"
                defaultValue={String(filters.limit)}
                className="rounded-2xl border px-3 py-2 text-sm text-[var(--widget-text)]"
                style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)" }}
              >
                {[25, 50, 100].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <input type="hidden" name="page" value="1" />
            <Button type="submit">Apply filters</Button>
            <Link
              href={`/admin/analytics?tab=${activeTab}`}
              className={outlineLinkClass}
              style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
            >
              Clear
            </Link>
          </div>
        </form>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <TotalsCard label="Tenants" value={formatCount(totals.tenants)} helper="Tracked merchant tenants" />
          <TotalsCard label="Sessions" value={formatCount(totals.sessions)} helper="Distinct chat sessions saved" />
          <TotalsCard label="Engaged" value={formatCount(totals.engagedSessions)} helper="Sessions with >2 user messages" />
          <TotalsCard label="Requests" value={formatCount(totals.requests)} helper="Model calls logged in analytics" />
          <TotalsCard label="Tokens" value={formatCount(totals.totalTokens)} helper={`${formatCount(totals.promptTokens)} prompt / ${formatCount(totals.completionTokens)} completion`} />
          <TotalsCard label="Errors" value={formatCount(totals.errors)} helper="Blocked or failed analytics events" />
        </div>

        {activeTab === "overview" ? (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--widget-border)" }}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y" style={{ borderColor: "var(--widget-border)" }}>
              <thead style={{ background: "var(--widget-surface-alt)" }}>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-[var(--widget-text-muted)]">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Sessions</th>
                  <th className="px-4 py-3 font-medium">Engaged</th>
                  <th className="px-4 py-3 font-medium">Messages</th>
                  <th className="px-4 py-3 font-medium">Requests</th>
                  <th className="px-4 py-3 font-medium">Prompt Tokens</th>
                  <th className="px-4 py-3 font-medium">Completion Tokens</th>
                  <th className="px-4 py-3 font-medium">Total Tokens</th>
                  <th className="px-4 py-3 font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--widget-border)" }}>
                {summaries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-sm text-[var(--widget-text-muted)]">
                      No analytics rows yet. Once tenants start sending chat traffic through the instrumented API, usage will appear here.
                    </td>
                  </tr>
                ) : (
                  summaries.map((summary) => (
                    <tr key={summary.tenantId} className="text-sm text-[var(--widget-text)]">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{summary.tenantName}</div>
                        <div className="text-xs text-[var(--widget-text-muted)]">{summary.tenantKey}</div>
                      </td>
                      <td className="px-4 py-3">{formatCount(summary.sessionCount)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{formatCount(summary.engagedSessionCount)}</div>
                        <div className="text-xs text-[var(--widget-text-muted)]">{summary.sessionCount > 0 ? Math.round((summary.engagedSessionCount / summary.sessionCount) * 100) : 0}% rate</div>
                      </td>
                      <td className="px-4 py-3">
                        {formatCount(summary.messageCount)}
                        <div className="text-xs text-[var(--widget-text-muted)]">
                          {formatCount(summary.userMessageCount)} user / {formatCount(summary.assistantMessageCount)} assistant
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {formatCount(summary.requestCount)}
                        <div className="text-xs text-[var(--widget-text-muted)]">{formatCount(summary.errorCount)} errors</div>
                      </td>
                      <td className="px-4 py-3">{formatCount(summary.promptTokens)}</td>
                      <td className="px-4 py-3">{formatCount(summary.completionTokens)}</td>
                      <td className="px-4 py-3 font-medium">{formatCount(summary.totalTokens)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--widget-text-muted)]">{formatDateTime(summary.lastActiveAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}

        {activeTab === "sessions" ? (
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--widget-border)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface-alt)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--widget-text)]">Recent Sessions</div>
                <div className="mt-1 text-xs text-[var(--widget-text-muted)]">
                  Showing {formatCount(startRow)}-{formatCount(endRow)} of {formatCount(sessionPage.totalCount)} server-filtered sessions.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={buildExportHref("csv", false)}
                  className={outlineLinkClass}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Export all CSV
                </Link>
                <Link
                  href={buildExportHref("xlsx", false)}
                  className={outlineLinkClass}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Export all Excel
                </Link>
                <Link
                  href={buildExportHref("csv", true)}
                  className={outlineLinkClass}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Export engaged CSV
                </Link>
                <Link
                  href={buildExportHref("xlsx", true)}
                  className={outlineLinkClass}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Export engaged Excel
                </Link>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y" style={{ borderColor: "var(--widget-border)" }}>
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-[var(--widget-text-muted)]">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Session</th>
                  <th className="px-4 py-3 font-medium">Host</th>
                  <th className="px-4 py-3 font-medium">Messages</th>
                  <th className="px-4 py-3 font-medium">Requests</th>
                  <th className="px-4 py-3 font-medium">Tokens</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--widget-border)" }}>
                {recentSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-sm text-[var(--widget-text-muted)]">
                      No recent session analytics yet.
                    </td>
                  </tr>
                ) : (
                  recentSessions.map((session) => (
                    <tr
                      key={`${session.tenantId}:${session.sessionId}`}
                      className="text-sm text-[var(--widget-text)] cursor-pointer hover:bg-[var(--widget-surface-alt)] transition-colors"
                      onClick={() => {
                        setSelectedSession(session);
                        setIsModalOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium">{session.tenantName}</div>
                        <div className="text-xs text-[var(--widget-text-muted)]">{session.tenantKey}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-xs text-[var(--widget-text)]">{session.sessionId}</div>
                        <div className="mt-1 text-xs text-[var(--widget-text-muted)]">Started {formatDateTime(session.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--widget-text-muted)]">{session.hostOrigin || "—"}</td>
                      <td className="px-4 py-3">
                        {formatCount(session.messageCount)}
                        <div className="text-xs text-[var(--widget-text-muted)]">
                          {formatCount(session.userMessageCount)} user / {formatCount(session.assistantMessageCount)} assistant
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {formatCount(session.requestCount)}
                        <div className="text-xs text-[var(--widget-text-muted)]">{formatCount(session.errorCount)} errors</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatCount(session.totalTokens)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--widget-text-muted)]">{formatDateTime(session.lastRequestAt || session.updatedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface-alt)" }}>
            <div className="text-xs text-[var(--widget-text-muted)]">
              Page {formatCount(filters.page)} of {formatCount(totalPages)}
            </div>
            <div className="flex gap-2">
              {filters.page <= 1 ? (
                <span
                  className={`${outlineLinkClass} cursor-not-allowed opacity-50`}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Previous
                </span>
              ) : (
                <Link
                  href={buildHref({ page: Math.max(1, filters.page - 1), tab: "sessions" })}
                  className={outlineLinkClass}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Previous
                </Link>
              )}
              {filters.page >= totalPages || sessionPage.totalCount === 0 ? (
                <span
                  className={`${outlineLinkClass} cursor-not-allowed opacity-50`}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Next
                </span>
              ) : (
                <Link
                  href={buildHref({ page: Math.min(totalPages, filters.page + 1), tab: "sessions" })}
                  className={outlineLinkClass}
                  style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface)", color: "var(--widget-text)" }}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>
        ) : null}
      </CardContent>
    </Card>
    <SessionMessagesModal
      isOpen={isModalOpen}
      session={selectedSession}
      onClose={() => {
        setIsModalOpen(false);
        setSelectedSession(null);
      }}
    />
    </>
  );
}
