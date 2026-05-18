/**
 * Visitor profile tracking — bridge-aware.
 *
 * In embed mode, the profile is received from embed.js (host page localStorage)
 * and saved back via postMessage. In standalone mode, uses localStorage directly.
 */

import { getScopedStorageKey, setStorageNamespace } from "@/lib/browser-session";

export interface VisitorProfile {
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
  viewedProducts: string[];
  viewedCategories: string[];
  purchasedProducts: string[];
  lastConversationStage: string;
  preferences: Record<string, string>;
}

const STORAGE_KEY = "visitor_profile";

let profileCache: VisitorProfile | null = null;
let embedded = false;

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function emptyProfile(): VisitorProfile {
  return {
    visitCount: 0,
    firstVisit: today(),
    lastVisit: today(),
    viewedProducts: [],
    viewedCategories: [],
    purchasedProducts: [],
    lastConversationStage: "",
    preferences: {},
  };
}

function postToParent(profile: VisitorProfile) {
  if (!embedded) return;
  try {
    window.parent.postMessage({ type: "shop-assist-save-profile", profile }, "*");
  } catch { /* noop */ }
}

/** Called once when shop-assist-init arrives from embed.js */
export function initProfileFromBridge(
  profile: VisitorProfile | null,
  isEmbed: boolean
) {
  embedded = isEmbed;
  if (profile) {
    profileCache = { ...emptyProfile(), ...profile };
  }
}

export function configureProfileStorageNamespace(namespace: string | null | undefined) {
  setStorageNamespace(namespace);
}

export function loadVisitorProfile(): VisitorProfile {
  if (profileCache) return profileCache;

  if (!embedded && typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));
      if (raw) {
        const loaded: VisitorProfile = { ...emptyProfile(), ...JSON.parse(raw) };
        profileCache = loaded;
        return loaded;
      }
    } catch { /* noop */ }
  }

  return emptyProfile();
}

export function saveVisitorProfile(profile: VisitorProfile) {
  const trimmed: VisitorProfile = {
    ...profile,
    viewedProducts: profile.viewedProducts.slice(-20),
    viewedCategories: profile.viewedCategories.slice(-10),
    purchasedProducts: profile.purchasedProducts.slice(-20),
  };
  profileCache = trimmed;

  if (embedded) {
    postToParent(trimmed);
  } else {
    try {
      localStorage.setItem(getScopedStorageKey(STORAGE_KEY), JSON.stringify(trimmed));
    } catch { /* quota */ }
  }
}

export function recordVisit(pageContext?: {
  productName?: string;
  category?: string;
  purchasedProducts?: string[];
}): VisitorProfile {
  const profile = loadVisitorProfile();
  const isNewDay = profile.lastVisit !== today();

  if (isNewDay || profile.visitCount === 0) {
    profile.visitCount++;
  }
  if (!profile.firstVisit) profile.firstVisit = today();
  profile.lastVisit = today();

  if (pageContext?.productName) {
    if (!profile.viewedProducts.includes(pageContext.productName)) {
      profile.viewedProducts.push(pageContext.productName);
    }
  }

  if (pageContext?.category) {
    if (!profile.viewedCategories.includes(pageContext.category)) {
      profile.viewedCategories.push(pageContext.category);
    }
  }

  if (pageContext?.purchasedProducts) {
    for (const p of pageContext.purchasedProducts) {
      if (!profile.purchasedProducts.includes(p)) {
        profile.purchasedProducts.push(p);
      }
    }
  }

  saveVisitorProfile(profile);
  return profile;
}

export function extractPreferencesFromChat(
  messages: { role: string; text: string }[]
): Record<string, string> {
  const prefs: Record<string, string> = {};

  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const text = msg.text.toLowerCase();

    if (text.includes("side sleeper") || text.includes("sleep on my side"))
      prefs.sleepPosition = "side";
    if (text.includes("back sleeper") || text.includes("sleep on my back"))
      prefs.sleepPosition = "back";
    if (text.includes("stomach sleeper") || text.includes("sleep on my stomach"))
      prefs.sleepPosition = "stomach";
    if (text.includes("combination") || text.includes("move around"))
      prefs.sleepPosition = "combination";

    if (text.includes("sleep hot") || text.includes("too hot") || text.includes("sweaty"))
      prefs.temperature = "hot";
    if (text.includes("sleep cold")) prefs.temperature = "cold";

    const budgetMatch = text.match(/under \$[\d,]+|\$[\d,]+-\$[\d,]+|\$[\d,]+\+/i);
    if (budgetMatch) prefs.budget = budgetMatch[0];

    for (const size of ["twin xl", "twin", "full", "queen", "king", "cal king"]) {
      if (text.includes(size)) prefs.size = size;
    }

    if (text.includes("back pain") || text.includes("back kills")) prefs.painPoint = "back";
    if (text.includes("hip pain") || text.includes("hip hurts")) prefs.painPoint = "hip";
    if (text.includes("shoulder")) prefs.painPoint = "shoulder";

    if (text.includes("firm")) prefs.firmness = "firm";
    if (text.includes("soft") || text.includes("plush")) prefs.firmness = "soft";
    if (text.includes("medium")) prefs.firmness = "medium";
  }

  return prefs;
}

export function updateProfileFromChat(
  messages: { role: string; text: string }[],
  stage: string
) {
  const profile = loadVisitorProfile();
  const prefs = extractPreferencesFromChat(messages);
  profile.preferences = { ...profile.preferences, ...prefs };
  profile.lastConversationStage = stage;
  saveVisitorProfile(profile);
}
