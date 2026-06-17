import { SYSTEM_PROMPT_RAW } from "@/data/system-prompt-raw";
import {
  buildSkillsPrompt,
  discoverSkills,
  resolveSkillContent,
  type SkillMetadata,
} from "@/lib/skills";
import type { TenantSkillPrompts } from "@/lib/platform-types";

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

export interface BrowsingHistoryEntry {
  productName: string;
  productPrice?: string;
  productUrl?: string;
  viewedAt: string;
}

export interface PageContext {
  page: "pdp" | "category" | "cart" | "homepage" | "search" | "unknown";
  productName?: string;
  /** Shopify variant id (numeric) when the embed runs on a Shopify storefront. */
  productVariantId?: number;
  productSku?: string;
  productPrice?: string;
  productVendor?: string;
  productType?: string;
  productDescription?: string;
  productImage?: string;
  productUrl?: string;
  productTags?: string[];
  category?: string;
  cartItems?: string[];
  cartTotal?: string;
  cartCount?: number;
  searchQuery?: string;
  /** Seconds on current page (from embed / host). */
  dwellSeconds?: number;
  /** Proactive re-engagement threshold in ms (from mock panel / host). */
  dwellThreshold?: number;
  pageHistory?: string[];
  purchasedProducts?: string[];
  browsingHistory?: BrowsingHistoryEntry[];
}

/** IP-inferred customer location, provided by Vercel's edge headers on
 *  every request. All fields are optional — on localhost and some
 *  preview builds the headers are absent. */
export interface CustomerLocation {
  city?: string;
  region?: string;   // state / province code, e.g. "GA"
  country?: string;  // ISO code, e.g. "US"
  latitude?: string;
  longitude?: string;
  timezone?: string;
}

export function getDefaultSystemPrompt(): string {
  return SYSTEM_PROMPT_RAW;
}

export function getDefaultSkillContent(skillName: string): string {
  const content = resolveSkillContent(skillName);
  if (!content) {
    throw new Error(`[system-prompt] Unknown skill: ${skillName}`);
  }
  return content;
}

/**
 * Build a human-readable context block so the AI knows exactly what the
 * customer is doing on the website right now.
 */
function buildContextNarrative(
  pageContext?: PageContext,
  visitorProfile?: VisitorProfile
): string {
  if (!pageContext && !visitorProfile) return "";

  const parts: string[] = [];

  if (pageContext) {
    parts.push("# CURRENT PAGE CONTEXT\n");

    if (pageContext.page === "pdp" && pageContext.productName) {
      parts.push(`The customer is currently viewing a product page:\n`);
      parts.push(`- **Product:** ${pageContext.productName}`);
      if (pageContext.productPrice) parts.push(`- **Price:** ${pageContext.productPrice}`);
      if (pageContext.productVendor) parts.push(`- **Brand:** ${pageContext.productVendor}`);
      if (pageContext.productType) parts.push(`- **Type:** ${pageContext.productType}`);
      if (pageContext.productSku) parts.push(`- **SKU:** ${pageContext.productSku}`);
      if (pageContext.productVariantId != null) {
        parts.push(`- **Shopify variant id:** ${pageContext.productVariantId} (use addToCart(${pageContext.productVariantId}) for the on-store cart)`);
      }
      if (pageContext.productDescription) parts.push(`- **Description:** ${pageContext.productDescription}`);
      if (pageContext.productTags && pageContext.productTags.length) {
        parts.push(`- **Tags:** ${pageContext.productTags.join(", ")}`);
      }
      if (pageContext.productUrl) parts.push(`- **URL:** ${pageContext.productUrl}`);
      parts.push("");
      parts.push("Use this product information when the customer asks about what they're looking at. You can proactively reference this product by name.");
    } else if (pageContext.page === "category") {
      parts.push(`The customer is browsing a category/collection page.`);
      if (pageContext.category) parts.push(`- **Category:** ${pageContext.category}`);
    } else if (pageContext.page === "cart") {
      parts.push(`The customer is on the cart page.`);
    } else if (pageContext.page === "search" && pageContext.searchQuery) {
      parts.push(`The customer is on search results for: "${pageContext.searchQuery}"`);
    } else if (pageContext.page === "homepage") {
      parts.push(`The customer is on the homepage.`);
    }

    // ALWAYS show cart status regardless of page type. The customer's cart
    // is a first-class signal for every recommendation, upsell, and
    // cross-sell decision. Without this, the AI recommends items already
    // in the cart because it can't see them.
    parts.push("\n## SHOPIFY CART STATUS\n");
    if (pageContext.cartItems && pageContext.cartItems.length > 0) {
      parts.push("The customer's cart currently contains:");
      for (const item of pageContext.cartItems) {
        parts.push(`- ${item}`);
      }
      if (pageContext.cartTotal) parts.push(`\n**Cart total:** ${pageContext.cartTotal}`);
      parts.push("\n**IMPORTANT:** NEVER suggest adding anything that is already in this cart list. When recommending complementary items, mattresses, or accessories, cross-reference this cart and pick something the customer doesn't already have. If the customer asks about a product that's already in their cart, acknowledge it's in their cart rather than pitching it again.");
    } else {
      parts.push("The cart is currently empty.");
    }

    // Browsing history
    if (pageContext.browsingHistory && pageContext.browsingHistory.length > 0) {
      parts.push("\n## BROWSING HISTORY\n");
      parts.push("Products the customer has viewed during this session (most recent first):\n");
      for (const entry of pageContext.browsingHistory.slice(0, 10)) {
        const ago = getTimeAgo(entry.viewedAt);
        parts.push(`- **${entry.productName}**${entry.productPrice ? " (" + entry.productPrice + ")" : ""}${ago ? " — viewed " + ago : ""}`);
      }
      parts.push("\nUse this history to understand what the customer is comparing and what price range they're exploring. Reference products they've viewed when making recommendations.");
    }

    if (pageContext.dwellSeconds) {
      parts.push(`\nThe customer has been on this page for about ${pageContext.dwellSeconds} seconds.`);
    }
  }

  if (visitorProfile) {
    parts.push("\n# VISITOR PROFILE\n");
    parts.push(`- **Visit count:** ${visitorProfile.visitCount}`);
    parts.push(`- **First visit:** ${visitorProfile.firstVisit}`);
    if (visitorProfile.viewedProducts.length > 0) {
      parts.push(`- **Previously viewed:** ${visitorProfile.viewedProducts.join(", ")}`);
    }
    if (visitorProfile.purchasedProducts.length > 0) {
      parts.push(`- **Past purchases:** ${visitorProfile.purchasedProducts.join(", ")}`);
    }
    if (Object.keys(visitorProfile.preferences).length > 0) {
      parts.push(`- **Known preferences:** ${JSON.stringify(visitorProfile.preferences)}`);
    }
  }

  return parts.length > 0 ? "\n\n---\n\n" + parts.join("\n") : "";
}

function getTimeAgo(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

const UI_INSTRUCTIONS = [
  "## CRITICAL: UI Output Rules",
  "",
  "Do NOT write fenced HTML, HTML product cards, HTML chips, inline buttons, or JavaScript handlers in chat responses.",
  "",
  "Use tools for interactive UI:",
  "- Specialized playbooks -> `load_skill`",
  "- Discovery and guided-selling questions -> `ask_user_question`",
  "- Product recommendation cards -> `product_search`",
  "- Product comparisons -> `compare_tool`",
  "",
  "Plain assistant text should be concise markdown only. Never use fenced HTML blocks.",
  "Never output `[STAGE:...]` metadata tags or any routing markers — the server handles flow routing.",
  "",
  "### Discovery Questions Use The Tool",
  "",
  "For discovery or guided-selling questions, do NOT render HTML pills, chips, submit buttons, or multi-select HTML.",
  "Call the `ask_user_question` tool instead.",
  "",
  "- Put the full discovery step in one tool call.",
  "- Ask 1 to 3 questions total in that tool call.",
  "- Each question needs a short `header`, the shopper-facing `question`, and 2 to 4 `options`.",
  "- Set `multiSelect: true` only when the shopper should be able to pick more than one option for that question.",
  "- If you need one more preference after prior answers, call `ask_user_question` again. Do not create HTML fallback controls.",
  "- After the tool returns answers, continue naturally and move toward recommendations.",
  "",
  "### Product Search Uses The Catalog Agent",
  "",
  "The full product catalog is NOT in this prompt.",
  "When you need products, call `product_search` with the shopper request and known constraints.",
  "That tool runs a dedicated catalog retrieval agent against the full store catalog and returns matching product cards.",
  "",
  "- Do NOT invent products, prices, links, images, SKUs, or variant IDs.",
  "- Use the exact products returned by `product_search` for recommendations and follow-up compare requests.",
  "- Write at most one short setup sentence before the tool call and one short follow-up question after it.",
  "- If the shopper asks to compare products you just showed, call `compare_tool` with those exact returned products.",
  "",
  "### Product Comparison Uses The Tool",
  "",
  "When the shopper wants to compare 2 to 4 specific products, call the `compare_tool`.",
  "",
  "- Pass the exact shortlisted products you are comparing.",
  "- Include a short `shopperGoal` tied to what matters to them.",
  "- Include a `recommendation` when one option is clearly the best fit.",
  "- The tool UI renders the side-by-side comparison, so keep surrounding prose brief and do not recreate the table in markdown.",
  "",
  "### Post-Product Follow-up",
  "",
  "After `product_search`, ask a brief natural-language follow-up. Do not create HTML action bars or HTML chips for product follow-up actions.",
].join("\n");

type PreloadedSkill = { name: string; content?: string | null };

function buildPreloadedSkillsSection(
  skills: PreloadedSkill[],
  skillPrompts?: TenantSkillPrompts | null
): string {
  const blocks = skills.map((skill) => {
    const content =
      skill.content?.trim() ||
      resolveSkillContent(skill.name, skillPrompts ?? null) ||
      "";
    return `## ${skill.name}\n\n${content}`;
  });

  const header =
    skills.length === 1
      ? `# ACTIVE SKILL (${skills[0].name})`
      : `# ACTIVE SKILLS (${skills.map((skill) => skill.name).join(", ")})`;

  return `\n\n---\n\n${header}\n\n${blocks.join("\n\n---\n\n")}`;
}

/** Render a compact CUSTOMER LOCATION block when any geo field is present.
 *  Returns "" when the location is entirely missing (localhost, preview,
 *  Vercel-bypassed request) so the prompt isn't bloated with empty fields. */
function buildCustomerLocationBlock(loc?: CustomerLocation): string {
  if (!loc) return "";
  const hasAny = loc.city || loc.region || loc.country || loc.latitude || loc.longitude || loc.timezone;
  if (!hasAny) return "";
  const lines: string[] = ["\n\n---\n\n# CUSTOMER LOCATION (approximate, IP-inferred)\n"];
  if (loc.city) lines.push(`- **City:** ${loc.city}`);
  if (loc.region) lines.push(`- **State/Region:** ${loc.region}`);
  if (loc.country) lines.push(`- **Country:** ${loc.country}`);
  if (loc.timezone) lines.push(`- **Timezone:** ${loc.timezone}`);
  if (loc.latitude && loc.longitude) {
    lines.push(`- **Coordinates:** ${loc.latitude}, ${loc.longitude}`);
  }
  lines.push(
    "",
    "This is approximate — IP geolocation may be off for VPN users or in dense metro areas.",
    "**Only reference this when relevant** (see Store & Location Handling rule in the universal prompt). Do NOT mention location unprompted."
  );
  return lines.join("\n");
}

export function buildSystemPrompt(
  catalogData: string,
  options?: {
    systemPrompt?: string | null;
    skills?: SkillMetadata[];
    skillPrompts?: TenantSkillPrompts | null;
    preloadedSkills?: PreloadedSkill[];
    pageContext?: PageContext;
    visitorProfile?: VisitorProfile;
    accessoryData?: string;
    interjectionType?: string;
    customerLocation?: CustomerLocation;
    complaintHint?: boolean;
  }
): string {
  const base = (options?.systemPrompt?.trim() || getDefaultSystemPrompt()).replace(
    "{{CATALOG_DATA}}",
    catalogData
  );

  const skills =
    options?.skills ?? discoverSkills(options?.skillPrompts ?? null);

  const preloadedSkills = options?.preloadedSkills ?? [];
  const skillSection =
    preloadedSkills.length > 0
      ? buildPreloadedSkillsSection(
          preloadedSkills,
          options?.skillPrompts ?? null
        )
      : `\n\n---\n\n${buildSkillsPrompt(skills)}`;

  const complaintHint = options?.complaintHint
    ? "\n\n**IMPORTANT:** The customer's latest message looks like a complaint or support request. Call `load_skill` with name `complaint` before responding."
    : "";

  const contextNarrative = buildContextNarrative(
    options?.pageContext,
    options?.visitorProfile
  );

  const accessoryBlock = options?.accessoryData
    ? `\n\n---\n\n${options.accessoryData}`
    : "";

  const interjectionBlock = options?.interjectionType
    ? `\n\n---\n\n# INTERJECTION TYPE\n\nUse the "${options.interjectionType}" sub-template from the skill above.`
    : "";

  const locationBlock = buildCustomerLocationBlock(options?.customerLocation);

  return `${base}${skillSection}${complaintHint}${contextNarrative}${accessoryBlock}${interjectionBlock}${locationBlock}\n\n---\n\n${UI_INSTRUCTIONS}`;
}
