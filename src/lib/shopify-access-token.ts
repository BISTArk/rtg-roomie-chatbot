import {
  getShopifyAppConfig,
  resolveExpiringShopifyAccessToken,
} from "@/lib/shopify";
import type { ShopifyInstallationRecord } from "@/lib/platform-types";
import { updateShopifyInstallationTokens } from "@/lib/tenant-platform";

export async function getShopifyAccessTokenForInstallation(input: {
  installation: ShopifyInstallationRecord;
  appOrigin: string;
}): Promise<string> {
  const config = getShopifyAppConfig(input.appOrigin);
  const resolved = await resolveExpiringShopifyAccessToken({
    shop: input.installation.shopDomain,
    accessToken: input.installation.accessToken,
    refreshToken: input.installation.refreshToken,
    accessTokenExpiresAt: input.installation.accessTokenExpiresAt,
    refreshTokenExpiresAt: input.installation.refreshTokenExpiresAt,
    config,
  });

  if (resolved.updated) {
    await updateShopifyInstallationTokens({
      tenantId: input.installation.tenantId,
      accessToken: resolved.accessToken,
      refreshToken: resolved.refreshToken ?? null,
      accessTokenExpiresAt: resolved.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: resolved.refreshTokenExpiresAt ?? null,
      scopes: resolved.scopes.length ? resolved.scopes : input.installation.scopes,
    });
  }

  return resolved.accessToken;
}
