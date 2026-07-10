import { isAdminAuthenticated } from "@/lib/admin-auth";
import { bootstrapTenantSession } from "@/lib/tenant-platform";
import type { PersistedChatMessage } from "@/lib/chat-types";
import type { VisitorProfile } from "@/lib/visitor-profile";

type BootstrapRequestBody = {
  tenantKey?: string;
  shopDomain?: string;
  sessionId?: string;
  hostOrigin?: string;
  localMessages?: PersistedChatMessage[];
  localProfile?: VisitorProfile | null;
};

const PUBLIC_BOOTSTRAP_ERROR =
  "The shopping assistant could not connect right now. Please try again shortly.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BootstrapRequestBody;
    const adminAuthenticated = await isAdminAuthenticated();
    if (!body.sessionId || (!body.tenantKey && !body.shopDomain)) {
      return Response.json(
        { error: "sessionId and either tenantKey or shopDomain are required." },
        { status: 400 }
      );
    }

    const bootstrap = await bootstrapTenantSession({
      tenantKey: body.tenantKey || "",
      shopDomain: body.shopDomain,
      sessionId: body.sessionId,
      hostOrigin: body.hostOrigin,
      localMessages: body.localMessages,
      localProfile: body.localProfile,
      skipHostValidation: adminAuthenticated,
    });

    return Response.json(bootstrap);
  } catch (error) {
    console.error("[widget bootstrap] failed:", error);

    return Response.json(
      {
        error: PUBLIC_BOOTSTRAP_ERROR,
      },
      { status: 503 }
    );
  }
}
