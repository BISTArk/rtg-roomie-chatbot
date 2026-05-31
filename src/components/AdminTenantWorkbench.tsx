"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CatalogSourceRecord,
  CatalogVersionRecord,
  TenantPromptStage,
  TenantRecord,
} from "@/lib/platform-types";
import { getDefaultSkillPrompt, getDefaultSystemPrompt } from "@/lib/system-prompt";

interface TenantDebugSnapshot {
  conversations: Array<{ sessionId: string; updatedAt: string }>;
  shares: Array<{ id: string; createdAt: string; expiresAt: string }>;
}

interface TenantWorkbenchItem {
  tenant: TenantRecord;
  sources: CatalogSourceRecord[];
  versions: CatalogVersionRecord[];
  debug: TenantDebugSnapshot;
}

type ModalType = "prompts" | "ops" | "debug";

type ActiveModal = {
  tenantId: string;
  type: ModalType;
} | null;

type PromptEditorDraft = {
  name: string;
  appName: string;
  appUrl: string;
  assistantName: string;
  launcherLabel: string;
  headerTitle: string;
  inputPlaceholder: string;
  supportUrl: string;
  storeLocatorUrl: string;
  handoffDescription: string;
  systemPrompt: string;
  skillPrompts: Record<TenantPromptStage, string>;
};

const PROMPT_STAGE_CONFIG: Array<{
  stage: TenantPromptStage;
  label: string;
  description: string;
}> = [
  { stage: "returning", label: "Returning", description: "Used when a known shopper comes back and the assistant should pick up continuity naturally." },
  { stage: "greeting", label: "Greeting", description: "Handles the first welcome turn and frames the conversation tone." },
  { stage: "discovery", label: "Discovery", description: "Guides questioning, needs assessment, and qualification." },
  { stage: "recommendation", label: "Recommendation", description: "Controls how the assistant recommends products from the catalog." },
  { stage: "comparison", label: "Comparison", description: "Shapes side-by-side comparison responses when shoppers weigh options." },
  { stage: "closing", label: "Closing", description: "Handles conversion, urgency, reassurance, and purchase nudges." },
  { stage: "reengagement", label: "Reengagement", description: "Used for proactive follow-up after activity or silence." },
  { stage: "contextual", label: "Contextual", description: "Used for short proactive prompts based on page context and browsing signals." },
  { stage: "new-session", label: "New Session", description: "Used when a brand-new session starts and the assistant initiates lightly." },
  { stage: "interjection", label: "Interjection", description: "Used for short interruptions or quick helper messages during flow changes." },
  { stage: "upsell", label: "Upsell", description: "Used for accessories, add-ons, bundles, and complementary item suggestions." },
  { stage: "complaint", label: "Complaint", description: "Used when complaint detection forces a service-recovery response." },
];

const DEFAULT_SYSTEM_PROMPT = getDefaultSystemPrompt();
const DEFAULT_SKILL_PROMPTS = Object.fromEntries(
  PROMPT_STAGE_CONFIG.map(({ stage }) => [stage, getDefaultSkillPrompt(stage)])
) as Record<TenantPromptStage, string>;

function arePromptsEquivalent(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left || "").trim() === (right || "").trim();
}

function getShopifyConnectDomain(domains: string[]): string {
  return domains.find((domain) => domain.endsWith(".myshopify.com")) || "";
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function configuredSkillPromptCount(tenant: TenantRecord): number {
  return PROMPT_STAGE_CONFIG.filter(({ stage }) => {
    const prompt = tenant.skillPrompts[stage];
    return Boolean(prompt?.trim()) && !arePromptsEquivalent(prompt, DEFAULT_SKILL_PROMPTS[stage]);
  }).length;
}

function getSystemPromptStatus(tenant: TenantRecord): string {
  if (!tenant.systemPrompt?.trim()) return "Using file fallback";
  return arePromptsEquivalent(tenant.systemPrompt, DEFAULT_SYSTEM_PROMPT)
    ? "Default prompt stored in DB"
    : "Custom prompt saved";
}

function getSkillPromptStatus(value: string, stage: TenantPromptStage): "fallback" | "seeded" | "custom" {
  if (!value.trim()) return "fallback";
  return arePromptsEquivalent(value, DEFAULT_SKILL_PROMPTS[stage]) ? "seeded" : "custom";
}

function buildPromptEditorDraft(tenant: TenantRecord): PromptEditorDraft {
  return {
    name: tenant.name,
    appName: tenant.appName,
    appUrl: tenant.appUrl,
    assistantName: tenant.branding.assistantName || "",
    launcherLabel: tenant.branding.launcherLabel || "",
    headerTitle: tenant.branding.headerTitle || "",
    inputPlaceholder: tenant.branding.inputPlaceholder || "",
    supportUrl: tenant.prompt.supportUrl || "",
    storeLocatorUrl: tenant.prompt.storeLocatorUrl || "",
    handoffDescription: tenant.prompt.handoffDescription || "",
    systemPrompt: tenant.systemPrompt || "",
    skillPrompts: PROMPT_STAGE_CONFIG.reduce<Record<TenantPromptStage, string>>((accumulator, { stage }) => {
      accumulator[stage] = tenant.skillPrompts[stage] || "";
      return accumulator;
    }, {} as Record<TenantPromptStage, string>),
  };
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-[var(--widget-text-muted)]">{label}</div>
        <div className="mt-2 text-sm font-medium text-[var(--widget-text)]">{value}</div>
      </CardContent>
    </Card>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function FormSection({
  value,
  title,
  description,
  children,
  defaultOpen = false,
}: {
  value: string;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Accordion type="single" defaultValue={defaultOpen ? value : null} collapsible className="space-y-0">
      <AccordionItem value={value} className="rounded-2xl border bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]" style={{ borderColor: "var(--widget-border)" }}>
        <AccordionTrigger className="px-4 py-4">
          <div>
            <div className="font-semibold text-[var(--widget-text)]">{title}</div>
            <div className="mt-1 text-sm text-[var(--widget-text-muted)]">{description}</div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="border-t px-4 pb-4 pt-4" style={{ borderColor: "var(--widget-border)" }}>
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function KeyValueList({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value || "(not set)"} />
      ))}
    </div>
  );
}

function ModalDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminTenantWorkbench({ tenantDetails }: { tenantDetails: TenantWorkbenchItem[] }) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [promptDraft, setPromptDraft] = useState<PromptEditorDraft | null>(null);

  const selected = useMemo(() => {
    if (!activeModal) return null;
    return tenantDetails.find((item) => item.tenant.tenantId === activeModal.tenantId) || null;
  }, [activeModal, tenantDetails]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tenant workspace</CardTitle>
          <CardDescription>
            Browse merchants, edit tenant-owned prompts directly, and manage catalog, domains, and recent activity in focused dialogs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" defaultValue={tenantDetails[0]?.tenant.tenantId} collapsible>
            {tenantDetails.map(({ tenant, sources, versions, debug }) => {
              const shopifyConnectDomain = getShopifyConnectDomain(tenant.allowedDomains);
              const configuredSkillPrompts = configuredSkillPromptCount(tenant);
              const isShopifyConnected = Boolean(tenant.shopifyInstallation);
              const systemPromptStatus = getSystemPromptStatus(tenant);

              return (
                <AccordionItem
                  key={tenant.tenantId}
                  value={tenant.tenantId}
                  className="overflow-hidden rounded-3xl border bg-[var(--widget-surface)] shadow-sm"
                  style={{ borderColor: "var(--widget-border)" }}
                >
                  <AccordionTrigger className="px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-semibold text-[var(--widget-text)]">{tenant.name}</h2>
                          <Badge>{tenant.tenantKey}</Badge>
                          <Badge variant={isShopifyConnected ? "success" : "secondary"}>
                            {isShopifyConnected ? `Shopify ${tenant.shopifyInstallation?.status}` : "Manual tenant"}
                          </Badge>
                        </div>
                        <p className="text-sm text-[var(--widget-text-muted)]">
                          {tenant.appUrl} • namespace {tenant.storageNamespace}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{tenant.allowedDomains.length} domains</Badge>
                          <Badge variant="outline">{versions.length} catalog versions</Badge>
                          <Badge variant="outline">{debug.conversations.length} saved sessions</Badge>
                          <Badge variant="outline">{configuredSkillPrompts} custom skill prompts</Badge>
                        </div>
                      </div>
                      <div className="grid min-w-[240px] grid-cols-1 gap-3 sm:grid-cols-2">
                        <MetricCard label="System prompt" value={systemPromptStatus} />
                        <MetricCard
                          label="Skills"
                          value={configuredSkillPrompts > 0 ? `${configuredSkillPrompts} custom skills` : "Default skills stored in DB"}
                        />
                      </div>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="border-t px-6 py-6" style={{ borderColor: "var(--widget-border)" }}>
                    <div className="grid gap-4 xl:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg">Prompt editor</CardTitle>
                              <CardDescription>
                                Edit the tenant-owned base prompt, launcher button copy, and stage skill prompts, with file-based fallback still available when fields are blank.
                              </CardDescription>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                setPromptDraft(buildPromptEditorDraft(tenant));
                                setActiveModal({ tenantId: tenant.tenantId, type: "prompts" });
                              }}
                            >
                              Edit prompts
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <MetricCard label="System prompt" value={systemPromptStatus} />
                          <MetricCard
                            label="Skill prompt coverage"
                            value={configuredSkillPrompts > 0 ? `${configuredSkillPrompts} custom tenant skills` : "Using seeded DB defaults"}
                          />
                          <div className="flex flex-wrap gap-2">
                            {PROMPT_STAGE_CONFIG.map(({ stage, label }) => (
                              <Badge key={stage} variant={getSkillPromptStatus(tenant.skillPrompts[stage] || "", stage) === "custom" ? "default" : "secondary"}>
                                {label} {getSkillPromptStatus(tenant.skillPrompts[stage] || "", stage) === "custom" ? "custom" : getSkillPromptStatus(tenant.skillPrompts[stage] || "", stage) === "seeded" ? "seeded" : "fallback"}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg">Prompt behavior</CardTitle>
                          <CardDescription>
                            Each tenant now owns a DB-backed base prompt and skill set. Blank fields still fall back to the shared prompt files at runtime.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-[var(--widget-text-muted)]">
                          <Card className="rounded-2xl bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]"><CardContent className="p-4">Seeded into each tenant DB record: the current default base prompt plus one prompt for every skill/stage.</CardContent></Card>
                          <Card className="rounded-2xl bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]"><CardContent className="p-4">File-based prompts still act as backup when you intentionally clear a field to fallback.</CardContent></Card>
                          <Card className="rounded-2xl bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]"><CardContent className="p-4">Live runtime context still gets appended automatically: catalog snapshot, cart, page context, browsing history, visitor profile, and location.</CardContent></Card>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg">Ops & activity</CardTitle>
                              <CardDescription>
                                Catalog sync, domains, source imports, and recent session diagnostics.
                              </CardDescription>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => setActiveModal({ tenantId: tenant.tenantId, type: "ops" })}>
                                Ops
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setActiveModal({ tenantId: tenant.tenantId, type: "debug" })}>
                                Debug
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                          <MetricCard
                            label="Shopify"
                            value={tenant.shopifyInstallation ? `${tenant.shopifyInstallation.shopDomain} (${tenant.shopifyInstallation.status})` : shopifyConnectDomain || "Not connected"}
                          />
                          <MetricCard label="Sources" value={String(sources.length)} />
                          <MetricCard label="Saved sessions" value={String(debug.conversations.length)} />
                          <MetricCard label="Share links" value={String(debug.shares.length)} />
                        </CardContent>
                      </Card>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {selected ? (
        <>
          <ModalDialog
            open={activeModal?.type === "prompts"}
            onOpenChange={(open) => setActiveModal(open ? activeModal : null)}
            title={`${selected.tenant.name} prompt editor`}
            description="Edit tenant-owned prompt text and widget button copy directly. Leave any field blank to fall back to the shared default markdown file."
          >
            {promptDraft ? (
              <form action={`/api/admin/tenants/${selected.tenant.tenantId}`} method="post" className="space-y-4">
              <FormSection value="basics" title="Store basics" description="Merchant naming and top-level app metadata." defaultOpen>
                <FieldGrid>
                  <Input name="name" value={promptDraft.name} onChange={(event) => setPromptDraft((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Tenant name" />
                  <Input name="appName" value={promptDraft.appName} onChange={(event) => setPromptDraft((current) => current ? { ...current, appName: event.target.value } : current)} placeholder="App name" />
                  <Input name="appUrl" value={promptDraft.appUrl} onChange={(event) => setPromptDraft((current) => current ? { ...current, appUrl: event.target.value } : current)} placeholder="Primary website URL" className="md:col-span-2" />
                </FieldGrid>
              </FormSection>

              <FormSection value="branding" title="Branding & handoff" description="Customer-facing copy and support/handoff links.">
                <FieldGrid>
                  <Input name="assistantName" value={promptDraft.assistantName} onChange={(event) => setPromptDraft((current) => current ? { ...current, assistantName: event.target.value } : current)} placeholder="Assistant name" />
                  <Input name="headerTitle" value={promptDraft.headerTitle} onChange={(event) => setPromptDraft((current) => current ? { ...current, headerTitle: event.target.value } : current)} placeholder="Header title" />
                  <Input name="launcherLabel" value={promptDraft.launcherLabel} onChange={(event) => setPromptDraft((current) => current ? { ...current, launcherLabel: event.target.value } : current)} placeholder="Launcher label" />
                  <Input name="inputPlaceholder" value={promptDraft.inputPlaceholder} onChange={(event) => setPromptDraft((current) => current ? { ...current, inputPlaceholder: event.target.value } : current)} placeholder="Input placeholder" />
                  <Input name="supportUrl" value={promptDraft.supportUrl} onChange={(event) => setPromptDraft((current) => current ? { ...current, supportUrl: event.target.value } : current)} placeholder="Support URL" />
                  <Input name="storeLocatorUrl" value={promptDraft.storeLocatorUrl} onChange={(event) => setPromptDraft((current) => current ? { ...current, storeLocatorUrl: event.target.value } : current)} placeholder="Store locator URL" />
                  <Input name="handoffDescription" value={promptDraft.handoffDescription} onChange={(event) => setPromptDraft((current) => current ? { ...current, handoffDescription: event.target.value } : current)} placeholder="Human handoff description" className="md:col-span-2" />
                </FieldGrid>
              </FormSection>

              <FormSection value="system" title="System prompt" description="This replaces the shared system prompt for this tenant only when saved.">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm text-[var(--widget-text-muted)]" style={{ borderColor: "var(--widget-border)" }}>
                    <span>{!promptDraft.systemPrompt.trim() ? "Blank means the shared default system prompt is used at runtime." : arePromptsEquivalent(promptDraft.systemPrompt, DEFAULT_SYSTEM_PROMPT) ? "This tenant currently stores the seeded default system prompt in DB." : "Custom system prompt will be saved for this tenant."}</span>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setPromptDraft((current) => current ? { ...current, systemPrompt: DEFAULT_SYSTEM_PROMPT } : current)}>
                        Load default
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPromptDraft((current) => current ? { ...current, systemPrompt: "" } : current)}>
                        Clear to fallback
                      </Button>
                    </div>
                  </div>
                  <Textarea name="systemPrompt" value={promptDraft.systemPrompt} onChange={(event) => setPromptDraft((current) => current ? { ...current, systemPrompt: event.target.value } : current)} className="min-h-[320px] font-mono text-xs leading-5" placeholder="Leave blank to use the shared SYSTEM_PROMPT.md fallback" />
                </div>
              </FormSection>

              <FormSection value="skills" title="Skill prompts" description="Each field overrides exactly one shared skill file for this tenant. Leave blank to inherit the shared fallback." defaultOpen>
                <div className="grid gap-3">
                  {PROMPT_STAGE_CONFIG.map(({ stage, label, description }) => {
                    const currentValue = promptDraft.skillPrompts[stage];
                    const status = getSkillPromptStatus(currentValue, stage);
                    return (
                      <Card key={stage} className="rounded-2xl border" style={{ borderColor: "var(--widget-border)" }}>
                        <CardHeader className="pb-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">{label}</CardTitle>
                              <CardDescription>{description}</CardDescription>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant={status === "custom" ? "default" : "secondary"}>
                                {status === "custom" ? "Custom" : status === "seeded" ? "Seeded default" : "File fallback"}
                              </Badge>
                              <Button type="button" variant="outline" size="sm" onClick={() => setPromptDraft((current) => current ? { ...current, skillPrompts: { ...current.skillPrompts, [stage]: DEFAULT_SKILL_PROMPTS[stage] } } : current)}>
                                Load default
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => setPromptDraft((current) => current ? { ...current, skillPrompts: { ...current.skillPrompts, [stage]: "" } } : current)}>
                                Clear
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Textarea
                            name={`skill:${stage}`}
                            value={currentValue}
                            onChange={(event) =>
                              setPromptDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      skillPrompts: {
                                        ...current.skillPrompts,
                                        [stage]: event.target.value,
                                      },
                                    }
                                  : current
                              )
                            }
                            className="min-h-[220px] font-mono text-xs leading-5"
                            placeholder={`Leave blank to use the shared ${stage}.md fallback`}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </FormSection>

              <DialogFooter className="px-0 pb-0">
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit">Save prompt configuration</Button>
              </DialogFooter>
            </form>
            ) : null}
          </ModalDialog>

          <ModalDialog
            open={activeModal?.type === "ops"}
            onOpenChange={(open) => setActiveModal(open ? activeModal : null)}
            title={`${selected.tenant.name} ops center`}
            description="Catalog sync, domains, source management, and install state in one place."
          >
            <div className="space-y-4">
              <FormSection value="shopify" title="Shopify status" description="OAuth access, storefront domain, and sync actions." defaultOpen>
                {selected.tenant.shopifyInstallation ? (
                  <div className="space-y-4">
                    <KeyValueList
                      items={[
                        { label: "Shop domain", value: selected.tenant.shopifyInstallation.shopDomain },
                        { label: "Storefront domain", value: selected.tenant.shopifyInstallation.storefrontDomain || "(not captured yet)" },
                        { label: "Status", value: selected.tenant.shopifyInstallation.status },
                        { label: "Scopes", value: selected.tenant.shopifyInstallation.scopes.join(", ") || "(none recorded)" },
                      ]}
                    />
                    {selected.sources.find((source) => source.type === "shopify") ? (
                      <form action={`/api/admin/tenants/${selected.tenant.tenantId}/catalog/sync`} method="post">
                        <input type="hidden" name="sourceId" value={selected.sources.find((source) => source.type === "shopify")?.id || ""} />
                        <Button type="submit" variant="outline">Sync Shopify catalog</Button>
                      </form>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3 text-sm text-[var(--widget-text-muted)]">
                    <p>This tenant is not linked to a Shopify OAuth/access record yet.</p>
                    {getShopifyConnectDomain(selected.tenant.allowedDomains) ? (
                      <a
                        href={`/api/shopify/install?shop=${encodeURIComponent(getShopifyConnectDomain(selected.tenant.allowedDomains))}`}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--widget-border)] bg-[var(--widget-surface)] px-4 py-2 text-sm font-medium text-[var(--widget-text)] transition-colors hover:bg-[var(--widget-surface-alt)]"
                      >
                        Connect Shopify access
                      </a>
                    ) : null}
                  </div>
                )}
              </FormSection>

              <FormSection value="domains" title="Allowed domains" description="Add storefront or custom domains for this tenant.">
                <form action={`/api/admin/tenants/${selected.tenant.tenantId}/domains`} method="post" className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {selected.tenant.allowedDomains.map((domain) => (
                      <Badge key={domain} variant="outline">{domain}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input name="hostname" placeholder="shop.client.com" className="min-w-0 flex-1" />
                    <Button type="submit">Add domain</Button>
                  </div>
                </form>
              </FormSection>

              <FormSection value="sources" title="Catalog imports & sources" description="Excel imports, Postgres sources, and source-level sync actions.">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-lg">Import Excel catalog</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <form action={`/api/admin/tenants/${selected.tenant.tenantId}/catalog/excel`} method="post" encType="multipart/form-data" className="space-y-3">
                        <Input name="sourceName" placeholder="Source label" />
                        <Input name="sheetName" placeholder="Upload sheet" />
                        <input name="file" type="file" accept=".xlsx,.xls" className="w-full rounded-2xl border border-[var(--widget-border)] bg-[var(--widget-surface)] px-4 py-3 text-sm text-[var(--widget-text)]" />
                        <Button type="submit">Upload and activate</Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader>
                      <CardTitle className="text-lg">Add Postgres source</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <form action={`/api/admin/tenants/${selected.tenant.tenantId}/catalog/postgres-source`} method="post" className="space-y-3">
                        <Input name="name" placeholder="Source name" />
                        <Input name="connectionString" placeholder="postgres://..." />
                        <Textarea name="queryText" placeholder="SELECT * FROM catalog_products" />
                        <Button type="submit">Save source</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-4 space-y-3">
                  {selected.sources.length === 0 ? (
                    <p className="text-sm text-[var(--widget-text-muted)]">No catalog sources yet.</p>
                  ) : (
                    selected.sources.map((source) => (
                      <Card key={source.id} className="rounded-2xl">
                        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium text-[var(--widget-text)]">{source.name}</div>
                            <div className="text-xs uppercase tracking-[0.16em] text-[var(--widget-text-muted)]">{source.type}</div>
                          </div>
                          {source.type === "postgres" || source.type === "shopify" ? (
                            <form action={`/api/admin/tenants/${selected.tenant.tenantId}/catalog/sync`} method="post">
                              <input type="hidden" name="sourceId" value={source.id} />
                              <Button type="submit" variant="outline" size="sm">
                                {source.type === "shopify" ? "Sync Shopify catalog" : "Sync and activate"}
                              </Button>
                            </form>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </FormSection>

              <FormSection value="versions" title="Catalog versions" description="Review snapshots and switch the active one.">
                <div className="space-y-3">
                  {selected.versions.length === 0 ? (
                    <p className="text-sm text-[var(--widget-text-muted)]">No versions yet.</p>
                  ) : (
                    selected.versions.map((version) => (
                      <Card key={version.id} className="rounded-2xl" style={{ borderColor: version.isActive ? "var(--widget-accent)" : "var(--widget-border)" }}>
                        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-medium text-[var(--widget-text)]">{version.label}</div>
                            <div className="text-xs text-[var(--widget-text-muted)]">
                              {version.sourceType} • {version.rowCount} rows • {formatDateTime(version.createdAt)}
                            </div>
                          </div>
                          {version.isActive ? (
                            <Badge>Active</Badge>
                          ) : (
                            <form action={`/api/admin/catalog-versions/${version.id}/activate`} method="post">
                              <input type="hidden" name="tenantId" value={selected.tenant.tenantId} />
                              <Button type="submit" variant="outline" size="sm">Activate</Button>
                            </form>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </FormSection>
            </div>
          </ModalDialog>

          <ModalDialog
            open={activeModal?.type === "debug"}
            onOpenChange={(open) => setActiveModal(open ? activeModal : null)}
            title={`${selected.tenant.name} recent activity`}
            description="Quick visibility into saved sessions and share links for this tenant."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Saved sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-[var(--widget-text-muted)]">
                    {selected.debug.conversations.length === 0 ? <li>No sessions yet.</li> : selected.debug.conversations.map((item) => (
                      <li key={item.sessionId}>{item.sessionId} • {formatDateTime(item.updatedAt)}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Share links</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-[var(--widget-text-muted)]">
                    {selected.debug.shares.length === 0 ? <li>No shares yet.</li> : selected.debug.shares.map((item) => (
                      <li key={item.id}>{item.id} • expires {formatDateTime(item.expiresAt)}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </ModalDialog>
        </>
      ) : null}
    </div>
  );
}
