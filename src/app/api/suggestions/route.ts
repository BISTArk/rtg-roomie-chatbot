import { generateSuggestions } from "@/lib/suggestions";
import { resolveTenantFromToken } from "@/lib/tenant-platform";
import type { UIMessage } from "ai";

export async function POST(request: Request) {
  try {
    const tenantToken = request.headers.get("x-tenant-token");
    const body = (await request.json()) as {
      messages?: UIMessage[];
      tenantKey?: string;
    };

    const tenantKey = body.tenantKey?.trim() || "";
    if (!tenantKey) {
      return Response.json({ error: "tenantKey is required." }, { status: 400 });
    }

    await resolveTenantFromToken(tenantKey, tenantToken);

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const suggestions = await generateSuggestions(messages);
    return Response.json({ suggestions });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate suggestions.",
      },
      { status: 500 }
    );
  }
}
