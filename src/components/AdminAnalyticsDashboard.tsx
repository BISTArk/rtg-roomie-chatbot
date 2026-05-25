import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
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

export default function AdminAnalyticsDashboard({
  summaries,
  recentSessions,
}: {
  summaries: TenantAnalyticsSummary[];
  recentSessions: TenantSessionAnalyticsRecord[];
}) {
  const totals = summaries.reduce(
    (acc, summary) => ({
      tenants: acc.tenants + 1,
      sessions: acc.sessions + summary.sessionCount,
      requests: acc.requests + summary.requestCount,
      totalTokens: acc.totalTokens + summary.totalTokens,
      promptTokens: acc.promptTokens + summary.promptTokens,
      completionTokens: acc.completionTokens + summary.completionTokens,
      errors: acc.errors + summary.errorCount,
    }),
    {
      tenants: 0,
      sessions: 0,
      requests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      errors: 0,
    }
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>
          Database-backed usage across tenants, including sessions, request volume, and token usage captured from the chat route.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <TotalsCard label="Tenants" value={formatCount(totals.tenants)} helper="Tracked merchant tenants" />
          <TotalsCard label="Sessions" value={formatCount(totals.sessions)} helper="Distinct chat sessions saved" />
          <TotalsCard label="Requests" value={formatCount(totals.requests)} helper="Model calls logged in analytics" />
          <TotalsCard label="Tokens" value={formatCount(totals.totalTokens)} helper={`${formatCount(totals.promptTokens)} prompt / ${formatCount(totals.completionTokens)} completion`} />
          <TotalsCard label="Errors" value={formatCount(totals.errors)} helper="Blocked or failed analytics events" />
        </div>

        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--widget-border)" }}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y" style={{ borderColor: "var(--widget-border)" }}>
              <thead style={{ background: "var(--widget-surface-alt)" }}>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-[var(--widget-text-muted)]">
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Sessions</th>
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
                    <td colSpan={8} className="px-4 py-6 text-sm text-[var(--widget-text-muted)]">
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

        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--widget-border)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--widget-border)", background: "var(--widget-surface-alt)" }}>
            <div className="text-sm font-semibold text-[var(--widget-text)]">Recent Sessions</div>
            <div className="mt-1 text-xs text-[var(--widget-text-muted)]">Most recently active sessions across all tenants, including token totals and request counts.</div>
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
                    <tr key={`${session.tenantId}:${session.sessionId}`} className="text-sm text-[var(--widget-text)]">
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
        </div>
      </CardContent>
    </Card>
  );
}
