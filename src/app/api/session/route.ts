import { resolveTenantFromToken, saveSessionState } from "@/lib/tenant-platform";
import type { PersistedChatMessage } from "@/lib/chat-types";
import type { VisitorProfile } from "@/lib/visitor-profile";

type SessionSyncRequest = {
  tenantKey?: string;
  sessionId?: string;
  hostOrigin?: string;
  lastPageUrl?: string;
  messages?: PersistedChatMessage[];
  visitorProfile?: VisitorProfile | null;
  suggestions?: string[] | null;
};

export async function POST(request: Request) {
  try {
    const tenantToken = request.headers.get("x-tenant-token");
    const body = (await request.json()) as SessionSyncRequest;
    if (!body.tenantKey || !body.sessionId) {
      return Response.json(
        { error: "tenantKey and sessionId are required." },
        { status: 400 }
      );
    }

    const tenant = await resolveTenantFromToken(body.tenantKey, tenantToken);
    await saveSessionState({
      tenantId: tenant.tenantId,
      sessionId: body.sessionId,
      hostOrigin: body.hostOrigin,
      lastPageUrl: body.lastPageUrl,
      messages: body.messages ?? [],
      visitorProfile: body.visitorProfile ?? null,
      suggestions: body.suggestions,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Session sync failed.",
      },
      { status: 500 }
    );
  }
}
