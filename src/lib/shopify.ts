import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { buildCatalogDataset } from "@/lib/catalog-ingestion";
import type { CatalogDataset } from "@/lib/platform-types";

const DEFAULT_API_VERSION = process.env.SHOPIFY_API_VERSION?.trim() || "2025-10";
const DEFAULT_SCOPES = process.env.SHOPIFY_SCOPES?.trim() || "read_products";
const OAUTH_STATE_TTL_MS = 1000 * 60 * 10;
const FALLBACK_API_VERSIONS = ["2026-04", "2026-01", "2025-10", "2025-07", "2025-04"];

export interface ShopifyAppConfig {
  apiKey: string;
  apiSecret: string;
  appUrl: string;
  scopes: string;
  apiVersion: string;
}

export interface ShopifyInstallState {
  nonce: string;
  shop: string;
  exp: number;
}

export interface ShopifyAccessTokenResponse {
  accessToken: string;
  scopes: string[];
  expiresIn?: number;
  refreshToken?: string;
  refreshTokenExpiresIn?: number;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
}

export interface ShopifyResolvedAccessToken extends ShopifyAccessTokenResponse {
  updated: boolean;
}

const SHOPIFY_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface ShopifyShopDetails {
  id: number;
  name: string;
  email?: string;
  myshopifyDomain: string;
  primaryDomainHost?: string;
  shopOwner?: string;
  currencyCode?: string;
}

export class ShopifyAdminAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ShopifyAdminAccessError";
    this.status = status;
  }
}

export function isShopifyAdminAccessError(error: unknown): error is ShopifyAdminAccessError {
  return error instanceof ShopifyAdminAccessError;
}

async function readShopifyErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim().slice(0, 300);
  } catch {
    return "";
  }
}

function buildShopifyAccessError(status: number, detail: string): ShopifyAdminAccessError {
  const suffix = detail ? ` ${detail}` : "";
  if (status === 401 || status === 403) {
    return new ShopifyAdminAccessError(
      `Shopify API access was denied (HTTP ${status}). The stored access token is missing, invalid, or was issued by a different app. Re-install the app to refresh API access.${suffix}`,
      status
    );
  }
  return new ShopifyAdminAccessError(
    `Shopify API request failed (HTTP ${status}).${suffix}`,
    status
  );
}

interface ShopifyGraphQlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface ShopifyProductEdge {
  cursor: string;
  node: {
    id: string;
    title: string;
    handle: string;
    vendor?: string | null;
    productType?: string | null;
    tags: string[];
    status?: string | null;
    description?: string | null;
    featuredImage?: { url?: string | null } | null;
    onlineStoreUrl?: string | null;
    variants: {
      edges: Array<{
        node: {
          id: string;
          sku?: string | null;
          title: string;
          price?: string | null;
          compareAtPrice?: string | null;
          availableForSale?: boolean | null;
          inventoryQuantity?: number | null;
        };
      }>;
    };
  };
}

interface ShopifyProductsPageResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    edges: ShopifyProductEdge[];
  };
}

function normalizeShopifyProductImageUrl(url: string | null | undefined): string {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return raw;
}

function normalizeShopifyProductUrl(input: {
  onlineStoreUrl?: string | null;
  storefrontDomain?: string | null;
  shop: string;
  handle: string;
}): string {
  const storefrontDomain = String(input.storefrontDomain || "").trim().toLowerCase();
  const fallbackHost = storefrontDomain || input.shop;
  const fallbackUrl = `https://${fallbackHost}/products/${input.handle}`;
  const raw = String(input.onlineStoreUrl || "").trim();

  if (!raw) {
    return fallbackUrl;
  }

  try {
    const parsed = new URL(raw);
    if (storefrontDomain) {
      parsed.hostname = storefrontDomain;
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return fallbackUrl;
  }
}

function formatShopifyAdminIdAsVariantId(adminGraphQlId: string): string {
  const match = adminGraphQlId.match(/\/(\d+)$/);
  return match?.[1] || "";
}

async function runShopifyGraphQl<T>(input: {
  shop: string;
  accessToken: string;
  config: ShopifyAppConfig;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const versionsToTry = getShopifyApiVersionsToTry(input.config.apiVersion);
  let lastError: Error | null = null;

  for (const apiVersion of versionsToTry) {
    const response = await fetch(
      `https://${input.shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": input.accessToken,
        },
        body: JSON.stringify({
          query: input.query,
          variables: input.variables ?? {},
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await readShopifyErrorBody(response);
      if (response.status === 401 || response.status === 403) {
        throw buildShopifyAccessError(response.status, detail);
      }
      if ((response.status === 400 || response.status === 404) && apiVersion !== versionsToTry[versionsToTry.length - 1]) {
        lastError = new Error(`Shopify GraphQL request failed with status ${response.status} using API version ${apiVersion}.`);
        continue;
      }
      throw new Error(
        `Shopify GraphQL request failed with status ${response.status}.${detail ? ` ${detail}` : ""}`
      );
    }

    const body = (await response.json()) as ShopifyGraphQlResponse<T>;
    if (body.errors?.length) {
      throw new Error(body.errors.map((error) => error.message || "Unknown Shopify GraphQL error").join(", "));
    }
    if (!body.data) {
      throw new Error("Shopify GraphQL request returned no data.");
    }
    return body.data;
  }

  throw lastError || new Error("Shopify GraphQL request failed.");
}

function getShopifyApiVersionsToTry(preferredVersion: string): string[] {
  const values = [preferredVersion, ...FALLBACK_API_VERSIONS]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(values)];
}

export async function buildCatalogDatasetFromShopify(input: {
  shop: string;
  storefrontDomain?: string | null;
  accessToken: string;
  config: ShopifyAppConfig;
}): Promise<CatalogDataset> {
  const headers = [
    "Product Name",
    "Variant Name",
    "Vendor",
    "Product Type",
    "Tags",
    "Description",
    "Sale Price",
    "Regular Price",
    "Availability",
    "Inventory Quantity",
    "SKU",
    "Image 1",
    "Product Link",
    "Shopify Variant ID",
    "Category",
    "Status",
  ];

  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const pageResponse: ShopifyProductsPageResponse = await runShopifyGraphQl<ShopifyProductsPageResponse>({
      shop: input.shop,
      accessToken: input.accessToken,
      config: input.config,
      query: `
        query ProductsPage($cursor: String) {
          products(first: 100, after: $cursor, sortKey: UPDATED_AT) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              cursor
              node {
                id
                title
                handle
                vendor
                productType
                tags
                status
                description
                onlineStoreUrl
                featuredImage {
                  url
                }
                variants(first: 25) {
                  edges {
                    node {
                      id
                      sku
                      title
                      price
                      compareAtPrice
                      availableForSale
                    }
                  }
                }
              }
            }
          }
        }
      `,
      variables: {
        cursor,
      },
    });

    for (const edge of pageResponse.products.edges) {
      const product = edge.node;
      if (String(product.status || "").trim().toUpperCase() !== "ACTIVE") {
        continue;
      }

      const productUrl = normalizeShopifyProductUrl({
        onlineStoreUrl: product.onlineStoreUrl,
        storefrontDomain: input.storefrontDomain,
        shop: input.shop,
        handle: product.handle,
      });

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        rows.push({
          "Product Name": product.title,
          "Variant Name": variant.title === "Default Title" ? "" : variant.title,
          Vendor: product.vendor || "",
          "Product Type": product.productType || "",
          Tags: Array.isArray(product.tags) ? product.tags.join(", ") : "",
          Description: product.description || "",
          "Sale Price": variant.price || "",
          "Regular Price": variant.compareAtPrice || variant.price || "",
          Availability: variant.availableForSale ? "In stock" : "Out of stock",
          "Inventory Quantity": "",
          SKU: variant.sku || "",
          "Image 1": normalizeShopifyProductImageUrl(product.featuredImage?.url),
          "Product Link": productUrl,
          "Shopify Variant ID": formatShopifyAdminIdAsVariantId(variant.id),
          Category: product.productType || "PRODUCT",
          Status: product.status || "",
        });
      }
    }

    hasNextPage = pageResponse.products.pageInfo.hasNextPage;
    cursor = pageResponse.products.pageInfo.endCursor || null;
  }

  return buildCatalogDataset({ headers, rows });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Shopify integration.`);
  }
  return value;
}

export function getShopifyAppConfig(requestOrigin?: string): ShopifyAppConfig {
  const apiKey = getRequiredEnv("SHOPIFY_API_KEY");
  const apiSecret = getRequiredEnv("SHOPIFY_API_SECRET");
  const appUrl = (process.env.SHOPIFY_APP_URL?.trim() || requestOrigin || "").replace(/\/+$/, "");
  if (!appUrl) {
    throw new Error("SHOPIFY_APP_URL is required for Shopify integration.");
  }

  return {
    apiKey,
    apiSecret,
    appUrl,
    scopes: DEFAULT_SCOPES,
    apiVersion: DEFAULT_API_VERSION,
  };
}

export function buildShopifyResyncCatalogUrl(appUrl: string, shop: string): string {
  return `${appUrl.replace(/\/+$/, "")}/shopify/installed?shop=${encodeURIComponent(shop)}&resync=1`;
}

export function normalizeShopifyShopDomain(input: string | null | undefined): string {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return "";

  const withoutProtocol = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(withoutProtocol)
    ? withoutProtocol
    : "";
}

function signWithSecret(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function compareSignature(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createShopifyInstallState(shop: string, secret: string): string {
  const payload: ShopifyInstallState = {
    nonce: randomUUID(),
    shop,
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signWithSecret(encoded, secret)}`;
}

export function verifyShopifyInstallState(
  token: string | null | undefined,
  secret: string
): ShopifyInstallState | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!compareSignature(signature, signWithSecret(encoded, secret))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ShopifyInstallState;
    if (!payload.shop || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function buildShopifyAuthUrl(input: {
  shop: string;
  state: string;
  config: ShopifyAppConfig;
}): string {
  const redirectUri = `${input.config.appUrl}/api/shopify/callback`;
  const params = new URLSearchParams({
    client_id: input.config.apiKey,
    scope: input.config.scopes,
    redirect_uri: redirectUri,
    state: input.state,
  });
  return `https://${input.shop}/admin/oauth/authorize?${params.toString()}`;
}

export function verifyShopifyCallbackHmac(
  searchParams: URLSearchParams,
  secret: string
): boolean {
  const receivedHmac = searchParams.get("hmac") || "";
  if (!receivedHmac) return false;

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return compareSignature(receivedHmac, digest);
}

function addSecondsIso(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function parseShopifyOAuthTokenResponse(data: Record<string, unknown>): ShopifyAccessTokenResponse {
  const accessToken = String(data.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Shopify token response did not include an access token.");
  }

  const expiresIn =
    typeof data.expires_in === "number"
      ? data.expires_in
      : typeof data.expires_in === "string" && data.expires_in.trim()
        ? Number(data.expires_in)
        : undefined;
  const refreshTokenExpiresIn =
    typeof data.refresh_token_expires_in === "number"
      ? data.refresh_token_expires_in
      : typeof data.refresh_token_expires_in === "string" && data.refresh_token_expires_in.trim()
        ? Number(data.refresh_token_expires_in)
        : undefined;
  const refreshToken =
    typeof data.refresh_token === "string" && data.refresh_token.trim()
      ? data.refresh_token.trim()
      : undefined;

  return {
    accessToken,
    scopes: String(data.scope || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    expiresIn,
    refreshToken,
    refreshTokenExpiresIn,
    accessTokenExpiresAt: expiresIn ? addSecondsIso(expiresIn) : null,
    refreshTokenExpiresAt: refreshTokenExpiresIn ? addSecondsIso(refreshTokenExpiresIn) : null,
  };
}

async function postShopifyOAuthTokenRequest(
  shop: string,
  body: Record<string, string | number>
): Promise<ShopifyAccessTokenResponse> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await readShopifyErrorBody(response);
    throw new Error(
      `Shopify token request failed with status ${response.status}.${detail ? ` ${detail}` : ""}`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseShopifyOAuthTokenResponse(data);
}

function assertExpiringShopifyTokenResponse(
  token: ShopifyAccessTokenResponse,
  context: string
): ShopifyAccessTokenResponse {
  if (!token.refreshToken || !token.expiresIn) {
    throw new Error(
      `Shopify ${context} did not return an expiring offline token (missing refresh_token or expires_in). Re-install the app to refresh API access.`
    );
  }
  return token;
}

export async function exchangeShopifyCodeForAccessToken(input: {
  shop: string;
  code: string;
  config: ShopifyAppConfig;
}): Promise<ShopifyAccessTokenResponse> {
  const token = assertExpiringShopifyTokenResponse(
    await postShopifyOAuthTokenRequest(input.shop, {
      client_id: input.config.apiKey,
      client_secret: input.config.apiSecret,
      code: input.code,
      expiring: 1,
    }),
    "OAuth token exchange"
  );
  return token;
}

export async function refreshShopifyAccessToken(input: {
  shop: string;
  refreshToken: string;
  config: ShopifyAppConfig;
}): Promise<ShopifyAccessTokenResponse> {
  return assertExpiringShopifyTokenResponse(
    await postShopifyOAuthTokenRequest(input.shop, {
      client_id: input.config.apiKey,
      client_secret: input.config.apiSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
    "token refresh"
  );
}

export async function migrateShopifyOfflineTokenToExpiring(input: {
  shop: string;
  accessToken: string;
  config: ShopifyAppConfig;
}): Promise<ShopifyAccessTokenResponse> {
  try {
    return assertExpiringShopifyTokenResponse(
      await postShopifyOAuthTokenRequest(input.shop, {
        client_id: input.config.apiKey,
        client_secret: input.config.apiSecret,
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: input.accessToken,
        subject_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
        requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
        expiring: 1,
      }),
      "offline token migration"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("invalid_subject_token")) {
      throw new ShopifyAdminAccessError(
        "Shopify offline token migration failed because the stored access token is no longer valid. Re-install the app to refresh API access.",
        403
      );
    }
    throw error;
  }
}

export async function resolveExpiringShopifyAccessToken(input: {
  shop: string;
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  config: ShopifyAppConfig;
}): Promise<ShopifyResolvedAccessToken> {
  const now = Date.now();
  const refreshToken = String(input.refreshToken || "").trim();

  if (refreshToken) {
    const accessExpiresAt = input.accessTokenExpiresAt
      ? new Date(input.accessTokenExpiresAt).getTime()
      : 0;
    if (!accessExpiresAt || accessExpiresAt - now > SHOPIFY_TOKEN_REFRESH_BUFFER_MS) {
      return {
        accessToken: input.accessToken,
        scopes: [],
        refreshToken,
        accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt: input.refreshTokenExpiresAt ?? null,
        updated: false,
      };
    }

    const refreshExpiresAt = input.refreshTokenExpiresAt
      ? new Date(input.refreshTokenExpiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (refreshExpiresAt <= now) {
      throw new ShopifyAdminAccessError(
        "Shopify refresh token expired. Open the app from Shopify admin to sign in again.",
        403
      );
    }

    const refreshed = await refreshShopifyAccessToken({
      shop: input.shop,
      refreshToken,
      config: input.config,
    });
    return { ...refreshed, updated: true };
  }

  const migrated = await migrateShopifyOfflineTokenToExpiring({
    shop: input.shop,
    accessToken: input.accessToken,
    config: input.config,
  });
  return { ...migrated, updated: true };
}

export async function assertShopifyAdminAccess(input: {
  shop: string;
  accessToken: string;
  config: ShopifyAppConfig;
}): Promise<void> {
  const token = String(input.accessToken || "").trim();
  if (!token) {
    throw new ShopifyAdminAccessError(
      "Missing Shopify access token. Re-install the app to refresh API access.",
      403
    );
  }

  await fetchShopifyShopDetails({
    shop: input.shop,
    accessToken: token,
    config: input.config,
  });
}

export async function fetchShopifyShopDetails(input: {
  shop: string;
  accessToken: string;
  config: ShopifyAppConfig;
}): Promise<ShopifyShopDetails> {
  const versionsToTry = getShopifyApiVersionsToTry(input.config.apiVersion);
  let lastError: Error | null = null;

  for (const apiVersion of versionsToTry) {
    const response = await fetch(
      `https://${input.shop}/admin/api/${apiVersion}/shop.json`,
      {
        headers: {
          "X-Shopify-Access-Token": input.accessToken,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await readShopifyErrorBody(response);
      if (response.status === 401 || response.status === 403) {
        throw buildShopifyAccessError(response.status, detail);
      }
      if ((response.status === 400 || response.status === 404) && apiVersion !== versionsToTry[versionsToTry.length - 1]) {
        lastError = new Error(`Could not load Shopify shop details with API version ${apiVersion} (status ${response.status}).`);
        continue;
      }
      throw new Error(
        `Could not load Shopify shop details (status ${response.status}).${detail ? ` ${detail}` : ""}`
      );
    }

    const data = (await response.json()) as {
      shop?: {
        id: number;
        name: string;
        email?: string;
        myshopify_domain?: string;
        primary_domain?: { host?: string };
        shop_owner?: string;
        currency?: string;
      };
    };

    if (!data.shop?.id || !data.shop.name || !data.shop.myshopify_domain) {
      throw new Error("Shopify shop details response was incomplete.");
    }

    return {
      id: data.shop.id,
      name: data.shop.name,
      email: data.shop.email,
      myshopifyDomain: data.shop.myshopify_domain,
      primaryDomainHost: data.shop.primary_domain?.host,
      shopOwner: data.shop.shop_owner,
      currencyCode: data.shop.currency,
    };
  }

  throw lastError || new Error("Could not load Shopify shop details.");
}

export function verifyShopifyWebhookSignature(input: {
  rawBody: string;
  hmacHeader: string | null;
  secret: string;
}): boolean {
  if (!input.hmacHeader) return false;
  const digest = createHmac("sha256", input.secret)
    .update(input.rawBody, "utf8")
    .digest("base64");
  return compareSignature(input.hmacHeader, digest);
}
