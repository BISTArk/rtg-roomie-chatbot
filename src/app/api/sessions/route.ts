import {
  deleteSessionHistory,
  listSessionHistory,
  resolveTenantFromToken,
} from "@/lib/tenant-platform";

export async function GET(request: Request) {
  try {
    const tenantToken = request.headers.get("x-tenant-token");
    const { searchParams } = new URL(request.url);
    const tenantKey = searchParams.get("tenantKey")?.trim() || "";
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);

    if (!tenantKey) {
      return Response.json({ error: "tenantKey is required." }, { status: 400 });
    }

    const tenant = await resolveTenantFromToken(tenantKey, tenantToken);
    const sessions = await listSessionHistory(tenant.tenantId, limit);
    return Response.json({ sessions });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load sessions." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantToken = request.headers.get("x-tenant-token");
    const body = (await request.json()) as { tenantKey?: string; sessionId?: string };
    const tenantKey = body.tenantKey?.trim() || "";
    const sessionId = body.sessionId?.trim() || "";

    if (!tenantKey || !sessionId) {
      return Response.json(
        { error: "tenantKey and sessionId are required." },
        { status: 400 }
      );
    }

    const tenant = await resolveTenantFromToken(tenantKey, tenantToken);
    await deleteSessionHistory({ tenantId: tenant.tenantId, sessionId });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to delete session." },
      { status: 500 }
    );
  }
}
