import type { WidgetBranding, WidgetTheme } from "@/lib/widget-config";
import type { PersistedChatMessage } from "@/lib/chat-types";
import type { VisitorProfile } from "@/lib/visitor-profile";

export type CatalogSourceType = "excel" | "postgres" | "shopify";

export type TenantSkillPrompts = Partial<Record<string, string>>;

export type ShopifyInstallStatus = "pending" | "installed" | "uninstalled";

export interface ShopifyInstallationRecord {
  id: string;
  tenantId: string;
  shopDomain: string;
  storefrontDomain?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  scopes: string[];
  status: ShopifyInstallStatus;
  shopName?: string | null;
  shopOwner?: string | null;
  email?: string | null;
  currencyCode?: string | null;
  createdAt: string;
  updatedAt: string;
  uninstalledAt?: string | null;
}

export interface TenantPromptConfig {
  brandName: string;
  websiteUrl?: string;
  supportUrl?: string;
  storeLocatorUrl?: string;
  handoffDescription?: string;
}

export interface TenantRuntimeConfig {
  tenantId: string;
  tenantKey: string;
  name: string;
  storageNamespace: string;
  appName: string;
  appUrl: string;
  theme: Partial<WidgetTheme>;
  branding: Partial<WidgetBranding>;
  prompt: TenantPromptConfig;
  systemPrompt: string | null;
  skillPrompts: TenantSkillPrompts;
}

export interface TenantRecord extends TenantRuntimeConfig {
  allowedDomains: string[];
  shopifyInstallation?: ShopifyInstallationRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionState {
  sessionId: string;
  messages: PersistedChatMessage[];
  visitorProfile: VisitorProfile | null;
  suggestions?: string[];
  updatedAt?: string;
}

export interface SessionHistoryItem {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  previewText: string;
  messageCount: number;
}

export interface TenantBootstrap {
  tenant: TenantRuntimeConfig;
  tenantToken: string;
  session: SessionState;
}

export interface CatalogDataset {
  headers: string[];
  rows: Record<string, string>[];
  fullCatalogText: string;
}

export interface CatalogVersionRecord {
  id: string;
  tenantId: string;
  sourceId: string | null;
  sourceType: CatalogSourceType;
  label: string;
  rowCount: number;
  isActive: boolean;
  createdAt: string;
  activatedAt?: string | null;
}

export interface CatalogSourceRecord {
  id: string;
  tenantId: string;
  type: CatalogSourceType;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string | null;
  syncRequestedAt?: string | null;
}

export interface TenantAnalyticsSummary {
  tenantId: string;
  tenantKey: string;
  tenantName: string;
  sessionCount: number;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorCount: number;
  engagedSessionCount: number;
  lastActiveAt?: string | null;
}

export interface TenantAnalyticsFilters {
  tenantIds?: string[];
  excludedTenantIds?: string[];
  fromDate?: string | null;
  toDate?: string | null;
}

export interface TenantSessionAnalyticsRecord {
  tenantId: string;
  tenantKey: string;
  tenantName: string;
  sessionId: string;
  hostOrigin?: string | null;
  createdAt: string;
  updatedAt: string;
  lastRequestAt?: string | null;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  errorCount: number;
}

export interface TenantSessionAnalyticsFilters extends TenantAnalyticsFilters {
  query?: string | null;
  errorsOnly?: boolean;
  engagedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface TenantSessionAnalyticsPage {
  records: TenantSessionAnalyticsRecord[];
  totalCount: number;
  limit: number;
  offset: number;
}
