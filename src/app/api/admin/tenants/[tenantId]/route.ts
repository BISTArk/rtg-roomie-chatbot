import { isAdminAuthenticated } from "@/lib/admin-auth";
import type { TenantSkillPrompts } from "@/lib/platform-types";
import { getDefaultSkillRegistry } from "@/lib/skills";
import { updateTenantConfig } from "@/lib/tenant-platform";

function readOptionalText(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) || "").trim();
  return value || undefined;
}

function readPromptText(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await params;
  const formData = await request.formData();
  const skillPrompts = getDefaultSkillRegistry().reduce<TenantSkillPrompts>((accumulator, skill) => {
    accumulator[skill.name] = readPromptText(formData, `skill:${skill.name}`);
    return accumulator;
  }, {});

  try {
    await updateTenantConfig({
      tenantId,
      name: readOptionalText(formData, "name"),
      appName: readOptionalText(formData, "appName"),
      appUrl: readOptionalText(formData, "appUrl"),
      prompt: {
        websiteUrl: readOptionalText(formData, "appUrl"),
        supportUrl: readOptionalText(formData, "supportUrl"),
        storeLocatorUrl: readOptionalText(formData, "storeLocatorUrl"),
        handoffDescription: readOptionalText(formData, "handoffDescription"),
        whatsappEnabled: formData.get("whatsappEnabled") === "1",
        whatsappFromNumber: readOptionalText(formData, "whatsappFromNumber"),
        whatsappHandoffMessage: readOptionalText(formData, "whatsappHandoffMessage"),
      },
      systemPrompt: readOptionalText(formData, "systemPrompt") ?? null,
      skillPrompts,
      branding: {
        assistantName: readOptionalText(formData, "assistantName"),
        launcherLabel: readOptionalText(formData, "launcherLabel"),
        headerTitle: readOptionalText(formData, "headerTitle"),
        inputPlaceholder: readOptionalText(formData, "inputPlaceholder"),
      },
    });
    return Response.redirect(new URL("/admin", request.url), 303);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update tenant." },
      { status: 500 }
    );
  }
}
