import { getScopedStorageKey } from "@/lib/browser-session";
import { PRIVACY_POLICY_PATH } from "@/content/privacy-policy";

export const PRIVACY_ACCEPTANCE_KEY = "privacy_accepted_at";

export function getPrivacyPolicyUrl(): string {
  if (typeof window === "undefined") {
    return PRIVACY_POLICY_PATH;
  }

  return `${window.location.origin}${PRIVACY_POLICY_PATH}`;
}

export function getPrivacyAcceptanceTimestamp(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return localStorage.getItem(getScopedStorageKey(PRIVACY_ACCEPTANCE_KEY));
  } catch {
    return null;
  }
}

export function hasAcceptedPrivacyNotice(): boolean {
  return Boolean(getPrivacyAcceptanceTimestamp());
}

export function getSellerPrivacyPolicyUrl(hostOrigin?: string | null): string | null {
  const origin = String(hostOrigin || "").trim();
  if (!origin) return null;

  try {
    return new URL("/policies/privacy-policy", origin).href;
  } catch {
    return null;
  }
}

export function recordPrivacyAcceptance(options?: { embed?: boolean }): void {
  if (typeof window === "undefined") return;
  if (hasAcceptedPrivacyNotice()) return;

  const timestamp = new Date().toISOString();

  try {
    localStorage.setItem(getScopedStorageKey(PRIVACY_ACCEPTANCE_KEY), timestamp);
  } catch {
    // noop
  }

  if (options?.embed && window.parent !== window) {
    window.parent.postMessage(
      { type: "shop-assist-save-privacy-acceptance", timestamp },
      "*"
    );
  }
}

export function restorePrivacyAcceptanceFromBridge(timestamp?: string | null): void {
  if (typeof window === "undefined") return;
  if (hasAcceptedPrivacyNotice()) return;

  const value = String(timestamp || "").trim();
  if (!value) return;

  try {
    localStorage.setItem(getScopedStorageKey(PRIVACY_ACCEPTANCE_KEY), value);
  } catch {
    // noop
  }
}
