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
  TenantRecord,
} from "@/lib/platform-types";

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

type ModalType = "stack" | "tune" | "ops" | "debug";

type ActiveModal = {
  tenantId: string;
  type: ModalType;
} | null;

function getShopifyConnectDomain(domains: string[]): string {
  return domains.find((domain) => domain.endsWith(".myshopify.com")) || "";
}

function summarizeText(value: string | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text) return fallback;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function stageGuidanceEntries(tenant: TenantRecord): Array<{ label: string; value?: string }> {
  return [
    { label: "Discovery", value: tenant.aiConfig.discoveryGuidance },
    { label: "Recommendations", value: tenant.aiConfig.recommendationGuidance },
    { label: "Comparisons", value: tenant.aiConfig.comparisonGuidance },
    { label: "Closing / Upsell", value: tenant.aiConfig.closingGuidance },
    { label: "Proactive", value: tenant.aiConfig.proactiveGuidance },
    { label: "Complaint", value: tenant.aiConfig.complaintGuidance },
  ];
}

function configuredStageGuidanceCount(tenant: TenantRecord): number {
  return stageGuidanceEntries(tenant).filter((entry) => entry.value?.trim()).length;
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
            Browse merchants in a cleaner accordion, then open focused shadcn-style dialogs for tuning, prompt context, operations, and debugging.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" defaultValue={tenantDetails[0]?.tenant.tenantId ?? null} collapsible>
            {tenantDetails.map(({ tenant, sources, versions, debug }) => {
              const shopifyConnectDomain = getShopifyConnectDomain(tenant.allowedDomains);
              const shopifySource = sources.find((source) => source.type === "shopify");
              const configuredGuidance = configuredStageGuidanceCount(tenant);
              const isShopifyConnected = Boolean(tenant.shopifyInstallation);

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
                          <Badge variant="outline">{configuredGuidance} stage overrides</Badge>
                        </div>
                      </div>
                      <div className="grid min-w-[240px] grid-cols-1 gap-3 sm:grid-cols-2">
                        <MetricCard
                          label="AI summary"
                          value={tenant.aiConfig.brandVoice?.trim() || "Using default voice"}
                        />
                        <MetricCard
                          label="Catalog"
                          value={shopifySource ? "Shopify sync ready" : "No Shopify source yet"}
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
                              <CardTitle className="text-lg">Tenant AI context</CardTitle>
                              <CardDescription>
                                Per-tenant prompt blocks injected into chat so each merchant can be tuned separately.
                              </CardDescription>
                            </div>
                            <Button size="sm" onClick={() => setActiveModal({ tenantId: tenant.tenantId, type: "tune" })}>
                              Tune
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <MetricCard label="Business summary" value={summarizeText(tenant.aiConfig.businessSummary, "No tenant-specific summary yet.")} />
                          <MetricCard label="Extra instructions" value={summarizeText(tenant.aiConfig.extraInstructions, "No extra instructions configured.")} />
                          <div className="flex flex-wrap gap-2">
                            {stageGuidanceEntries(tenant).map((entry) => (
                              <Badge key={entry.label} variant={entry.value?.trim() ? "default" : "secondary"}>
                                {entry.label} {entry.value?.trim() ? "tuned" : "default"}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-lg">Prompt stack</CardTitle>
                              <CardDescription>
                                See exactly what is shared globally versus what changes per tenant at runtime.
                              </CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setActiveModal({ tenantId: tenant.tenantId, type: "stack" })}>
                              Details
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-[var(--widget-text-muted)]">
                          <Card className="rounded-2xl bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]"><CardContent className="p-4">Shared across all tenants: base system prompt, skills, output rules, complaint detection, and catalog retrieval logic.</CardContent></Card>
                          <Card className="rounded-2xl bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]"><CardContent className="p-4">Tenant-specific: merchant links, branding copy, business summary, voice, policies, extra instructions, and stage guidance.</CardContent></Card>
                          <Card className="rounded-2xl bg-[color:color-mix(in_srgb,var(--widget-surface)_88%,white_12%)]"><CardContent className="p-4">Live runtime context: active catalog snapshot, cart, page context, browsing history, visitor profile, and location.</CardContent></Card>
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
            open={activeModal?.type === "stack"}
            onOpenChange={(open) => setActiveModal(open ? activeModal : null)}
            title={`${selected.tenant.name} prompt stack`}
            description="How this tenant’s final model context is assembled on each chat turn."
          >
            <div className="space-y-4">
              <FormSection value="shared" title="Shared prompt layers" description="Global files and runtime logic currently common to every tenant." defaultOpen>
                <ul className="space-y-2 text-sm text-[var(--widget-text)]">
                  <li>• Base system prompt from `SYSTEM_PROMPT.md`.</li>
                  <li>• Stage skills from the shared `skills/*` files.</li>
                  <li>• Output rules for proactive versus recommendation turns.</li>
                  <li>• Complaint detection, stage selection, and catalog retrieval rules.</li>
                </ul>
              </FormSection>

              <FormSection value="tenant" title="Tenant-specific injected blocks" description="Merchant-level knobs that layer on top of the shared skill set." defaultOpen>
                <KeyValueList
                  items={[
                    { label: "Brand name", value: selected.tenant.prompt.brandName || selected.tenant.name },
                    { label: "Website", value: selected.tenant.prompt.websiteUrl || selected.tenant.appUrl },
                    { label: "Support URL", value: selected.tenant.prompt.supportUrl || "(not set)" },
                    { label: "Store locator", value: selected.tenant.prompt.storeLocatorUrl || "(not set)" },
                    { label: "Handoff", value: selected.tenant.prompt.handoffDescription || "(not set)" },
                    { label: "Brand voice", value: selected.tenant.aiConfig.brandVoice || "(not set)" },
                    { label: "Target audience", value: selected.tenant.aiConfig.targetAudience || "(not set)" },
                    { label: "Extra instructions", value: selected.tenant.aiConfig.extraInstructions || "(not set)" },
                  ]}
                />
              </FormSection>

              <FormSection value="stages" title="Per-stage tenant tuning" description="Notes injected only when a given conversation stage is active." defaultOpen>
                <div className="grid gap-3 md:grid-cols-2">
                  {stageGuidanceEntries(selected.tenant).map((entry) => (
                    <MetricCard key={entry.label} label={entry.label} value={entry.value?.trim() || "Using shared default skill behavior."} />
                  ))}
                </div>
              </FormSection>

              <FormSection value="runtime" title="Runtime context" description="Live context always available when present at chat time.">
                <ul className="space-y-2 text-sm text-[var(--widget-text)]">
                  <li>• Active tenant catalog snapshot and accessory subset.</li>
                  <li>• Current page context, cart state, and browsing history.</li>
                  <li>• Visitor profile, prior purchases, and known preferences.</li>
                  <li>• Optional customer location from request headers.</li>
                </ul>
              </FormSection>
            </div>
          </ModalDialog>

          <ModalDialog
            open={activeModal?.type === "tune"}
            onOpenChange={(open) => setActiveModal(open ? activeModal : null)}
            title={`${selected.tenant.name} tenant tuning`}
            description="Edit the merchant-specific context blocks injected into the shared prompt stack."
          >
            <form action={`/api/admin/tenants/${selected.tenant.tenantId}`} method="post" className="space-y-4">
              <FormSection value="basics" title="Store basics" description="Merchant naming and top-level app metadata." defaultOpen>
                <FieldGrid>
                  <Input name="name" defaultValue={selected.tenant.name} placeholder="Tenant name" />
                  <Input name="appName" defaultValue={selected.tenant.appName} placeholder="App name" />
                  <Input name="appUrl" defaultValue={selected.tenant.appUrl} placeholder="Primary website URL" className="md:col-span-2" />
                </FieldGrid>
              </FormSection>

              <FormSection value="branding" title="Branding & handoff" description="Customer-facing copy and support/handoff links.">
                <FieldGrid>
                  <Input name="assistantName" defaultValue={selected.tenant.branding.assistantName || ""} placeholder="Assistant name" />
                  <Input name="headerTitle" defaultValue={selected.tenant.branding.headerTitle || ""} placeholder="Header title" />
                  <Input name="launcherLabel" defaultValue={selected.tenant.branding.launcherLabel || ""} placeholder="Launcher label" />
                  <Input name="inputPlaceholder" defaultValue={selected.tenant.branding.inputPlaceholder || ""} placeholder="Input placeholder" />
                  <Input name="supportUrl" defaultValue={selected.tenant.prompt.supportUrl || ""} placeholder="Support URL" />
                  <Input name="storeLocatorUrl" defaultValue={selected.tenant.prompt.storeLocatorUrl || ""} placeholder="Store locator URL" />
                  <Input name="handoffDescription" defaultValue={selected.tenant.prompt.handoffDescription || ""} placeholder="Human handoff description" className="md:col-span-2" />
                </FieldGrid>
              </FormSection>

              <FormSection value="core" title="Core AI guidance" description="Merchant-level context applied across all stages.">
                <div className="grid gap-3">
                  <Textarea name="businessSummary" defaultValue={selected.tenant.aiConfig.businessSummary || ""} placeholder="Business summary" />
                  <FieldGrid>
                    <Input name="brandVoice" defaultValue={selected.tenant.aiConfig.brandVoice || ""} placeholder="Brand voice" />
                    <Input name="targetAudience" defaultValue={selected.tenant.aiConfig.targetAudience || ""} placeholder="Target audience" />
                  </FieldGrid>
                  <FieldGrid>
                    <Textarea name="salesPolicy" defaultValue={selected.tenant.aiConfig.salesPolicy || ""} placeholder="Sales policy" />
                    <Textarea name="supportPolicy" defaultValue={selected.tenant.aiConfig.supportPolicy || ""} placeholder="Support policy" />
                  </FieldGrid>
                  <Textarea name="extraInstructions" defaultValue={selected.tenant.aiConfig.extraInstructions || ""} placeholder="Extra merchant instructions" />
                </div>
              </FormSection>

              <FormSection value="stages" title="Stage-specific tenant tuning" description="Per-tenant overrides appended only when that stage is active." defaultOpen>
                <div className="grid gap-3">
                  <Textarea name="discoveryGuidance" defaultValue={selected.tenant.aiConfig.discoveryGuidance || ""} placeholder="Discovery stage guidance" />
                  <Textarea name="recommendationGuidance" defaultValue={selected.tenant.aiConfig.recommendationGuidance || ""} placeholder="Recommendation stage guidance" />
                  <Textarea name="comparisonGuidance" defaultValue={selected.tenant.aiConfig.comparisonGuidance || ""} placeholder="Comparison stage guidance" />
                  <Textarea name="closingGuidance" defaultValue={selected.tenant.aiConfig.closingGuidance || ""} placeholder="Closing / upsell stage guidance" />
                  <Textarea name="proactiveGuidance" defaultValue={selected.tenant.aiConfig.proactiveGuidance || ""} placeholder="Proactive stage guidance" />
                  <Textarea name="complaintGuidance" defaultValue={selected.tenant.aiConfig.complaintGuidance || ""} placeholder="Complaint stage guidance" />
                </div>
              </FormSection>

              <DialogFooter className="px-0 pb-0">
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button type="submit">Save tenant tuning</Button>
              </DialogFooter>
            </form>
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
