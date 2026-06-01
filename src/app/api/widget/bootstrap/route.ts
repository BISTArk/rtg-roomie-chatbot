import { isAdminAuthenticated } from "@/lib/admin-auth";
import { bootstrapTenantSession } from "@/lib/tenant-platform";
import type { PersistedChatMessage } from "@/lib/chat-types";
import type { VisitorProfile } from "@/lib/visitor-profile";

type BootstrapRequestBody = {
  tenantKey?: string;
  sessionId?: string;
  hostOrigin?: string;
  localMessages?: PersistedChatMessage[];
  localProfile?: VisitorProfile | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BootstrapRequestBody;
    const adminAuthenticated = await isAdminAuthenticated();
    if (!body.sessionId || !body.tenantKey) {
      return Response.json(
        { error: "tenantKey and sessionId are required." },
        { status: 400 }
      );
    }

    const bootstrap = await bootstrapTenantSession({
      tenantKey: body.tenantKey,
      sessionId: body.sessionId,
      hostOrigin: body.hostOrigin,
      localMessages: body.localMessages,
      localProfile: body.localProfile,
      skipHostValidation: adminAuthenticated,
    });

    return Response.json(bootstrap);
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : "Widget bootstrap failed. Check DATABASE_URL, tenant domain mapping, and tenant token configuration.";

    return Response.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
