import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  listTenantSessionAnalyticsExportRecords,
  listTenants,
} from "@/lib/tenant-platform";

function isSeededDemoTenant(tenantKey: string): boolean {
  return tenantKey === "shop-assist-demo";
}

function readString(value: string | string[] | null): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function readArray(values: string[]): string[] {
  return values.map((value) => String(value || "")).filter(Boolean);
}

type ExportRow = {
  tenantName: string;
  tenantKey: string;
  sessionId: string;
  hostOrigin: string;
  createdAt: string;
  updatedAt: string;
  lastRequestAt: string;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorCount: number;
  engaged: string;
  transcript: string;
};

function toExportRows(records: Awaited<ReturnType<typeof listTenantSessionAnalyticsExportRecords>>): ExportRow[] {
  return records.map((record) => ({
    tenantName: record.tenantName,
    tenantKey: record.tenantKey,
    sessionId: record.sessionId,
    hostOrigin: record.hostOrigin || "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastRequestAt: record.lastRequestAt || "",
    messageCount: record.messageCount,
    userMessageCount: record.userMessageCount,
    assistantMessageCount: record.assistantMessageCount,
    requestCount: record.requestCount,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalTokens: record.totalTokens,
    errorCount: record.errorCount,
    engaged: record.userMessageCount > 2 ? "yes" : "no",
    transcript: record.transcript,
  }));
}

function escapeCsvCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows: ExportRow[]): string {
  const headers: Array<keyof ExportRow> = [
    "tenantName",
    "tenantKey",
    "sessionId",
    "hostOrigin",
    "createdAt",
    "updatedAt",
    "lastRequestAt",
    "messageCount",
    "userMessageCount",
    "assistantMessageCount",
    "requestCount",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "errorCount",
    "engaged",
    "transcript",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","));
  }
  return lines.join("\n");
}

function buildWorkbook(rows: ExportRow[]): Uint8Array {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sessions");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Uint8Array;
}

function buildFilename(format: "csv" | "xlsx", engagedOnly: boolean): string {
  const date = new Date().toISOString().slice(0, 10);
  return `analytics-sessions-${engagedOnly ? "engaged" : "all"}-${date}.${format}`;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formatParam = readString(request.nextUrl.searchParams.get("format"));
  const format = formatParam === "xlsx" ? "xlsx" : formatParam === "csv" ? "csv" : null;
  if (!format) {
    return Response.json({ error: "format must be csv or xlsx." }, { status: 400 });
  }

  const fromDate = readString(request.nextUrl.searchParams.get("from"));
  const toDate = readString(request.nextUrl.searchParams.get("to"));
  const query = readString(request.nextUrl.searchParams.get("q")).trim();
  const errorsOnly = readString(request.nextUrl.searchParams.get("errors")) === "1";
  const engagedOnly = readString(request.nextUrl.searchParams.get("engaged")) === "1";
  const requestedTenantIds = readArray(request.nextUrl.searchParams.getAll("tenant"));

  try {
    const tenants = await listTenants();
    const visibleTenants = tenants.filter((tenant) => !isSeededDemoTenant(tenant.tenantKey));
    const visibleTenantIds = new Set(visibleTenants.map((tenant) => tenant.tenantId));
    const selectedTenantIds = requestedTenantIds.filter((tenantId) => visibleTenantIds.has(tenantId));
    const hiddenTenantIds = tenants
      .filter((tenant) => !visibleTenantIds.has(tenant.tenantId))
      .map((tenant) => tenant.tenantId);

    const records = await listTenantSessionAnalyticsExportRecords({
      tenantIds: selectedTenantIds.length > 0 ? selectedTenantIds : undefined,
      excludedTenantIds: selectedTenantIds.length === 0 ? hiddenTenantIds : undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      query: query || undefined,
      errorsOnly,
      engagedOnly,
    });

    const rows = toExportRows(records);
    const filename = buildFilename(format, engagedOnly);

    if (format === "csv") {
      return new Response(buildCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(
      new Blob([buildWorkbook(rows)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
      }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to export analytics sessions." },
      { status: 500 }
    );
  }
}