import { isAdminAuthenticated } from "@/lib/admin-auth";
import { updateTenantConfig } from "@/lib/tenant-platform";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await params;
  const formData = await request.formData();

  try {
    await updateTenantConfig({
      tenantId,
      name: String(formData.get("name") || "").trim() || undefined,
      appName: String(formData.get("appName") || "").trim() || undefined,
      appUrl: String(formData.get("appUrl") || "").trim() || undefined,
      prompt: {
        websiteUrl: String(formData.get("appUrl") || "").trim() || undefined,
        supportUrl: String(formData.get("supportUrl") || "").trim() || undefined,
        storeLocatorUrl: String(formData.get("storeLocatorUrl") || "").trim() || undefined,
        handoffDescription:
          String(formData.get("handoffDescription") || "").trim() || undefined,
      },
      aiConfig: {
        businessSummary:
          String(formData.get("businessSummary") || "").trim() || undefined,
        brandVoice:
          String(formData.get("brandVoice") || "").trim() || undefined,
        targetAudience:
          String(formData.get("targetAudience") || "").trim() || undefined,
        salesPolicy:
          String(formData.get("salesPolicy") || "").trim() || undefined,
        supportPolicy:
          String(formData.get("supportPolicy") || "").trim() || undefined,
        extraInstructions:
          String(formData.get("extraInstructions") || "").trim() || undefined,
        discoveryGuidance:
          String(formData.get("discoveryGuidance") || "").trim() || undefined,
        recommendationGuidance:
          String(formData.get("recommendationGuidance") || "").trim() || undefined,
        comparisonGuidance:
          String(formData.get("comparisonGuidance") || "").trim() || undefined,
        closingGuidance:
          String(formData.get("closingGuidance") || "").trim() || undefined,
        proactiveGuidance:
          String(formData.get("proactiveGuidance") || "").trim() || undefined,
        complaintGuidance:
          String(formData.get("complaintGuidance") || "").trim() || undefined,
      },
      branding: {
        assistantName:
          String(formData.get("assistantName") || "").trim() || undefined,
        launcherLabel:
          String(formData.get("launcherLabel") || "").trim() || undefined,
        headerTitle:
          String(formData.get("headerTitle") || "").trim() || undefined,
        inputPlaceholder:
          String(formData.get("inputPlaceholder") || "").trim() || undefined,
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
