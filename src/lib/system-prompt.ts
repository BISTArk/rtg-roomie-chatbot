import { SYSTEM_PROMPT_RAW } from "@/data/system-prompt-raw";
import { SKILLS } from "@/data/skills-raw";

export type ConversationStage =
  | "returning"
  | "greeting"
  | "discovery"
  | "recommendation"
  | "comparison"
  | "closing"
  | "reengagement"
  | "contextual"
  | "new-session"
  | "interjection"
  | "upsell"
  | "complaint";

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

/** Load a file from the prebaked data. SYSTEM_PROMPT.md and skills/*.md
 *  are pre-read at build time by scripts/prebuild.mjs so there's no
 *  runtime filesystem access on Vercel. */
function loadFile(relativePath: string): string {
  if (relativePath === "SYSTEM_PROMPT.md") return SYSTEM_PROMPT_RAW;
  // skills/discovery.md → key "discovery"
  const skillMatch = relativePath.match(/^skills\/(.+)\.md$/);
  if (skillMatch && SKILLS[skillMatch[1]]) return SKILLS[skillMatch[1]];
  throw new Error(`[system-prompt] Unknown file: ${relativePath}`);
}

export function getDefaultSystemPrompt(): string {
  return loadFile("SYSTEM_PROMPT.md");
}

export function getDefaultSkillPrompt(stage: ConversationStage): string {
  return loadFile(`skills/${stage}.md`);
}

/** Lightweight safety net: strip any stray fenced HTML blocks that may
 *  have survived the source-file cleanup. The skill files now use
 *  tool-based instructions, but this catches edge cases where a raw
 *  ```html block appears in a prompt override. */
function stripLegacyHtmlInstructions(prompt: string): string {
  return prompt
    .replace(/```html[\s\S]*?```/gi, "")
    .replace(
      /\(three backticks\)html[\s\S]*?\(three backticks\)/gi,
      ""
    );
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
  "- Discovery and guided-selling questions -> `ask_user_question`",
  "- Product recommendation cards -> `product_search`",
  "- Product comparisons -> `compare_tool`",
  "",
  "Plain assistant text should be concise markdown only. Never use fenced HTML blocks.",
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
  "### Product Comparison Uses The Tool",
  "",
  "When the shopper wants to compare 2 to 4 specific products, call the `compare_tool`.",
  "",
  "- Pass the exact shortlisted products you are comparing.",
  "- Include a short `shopperGoal` tied to what matters to them.",
  "- Include a `recommendation` when one option is clearly the best fit.",
  "- The tool UI renders the side-by-side comparison, so keep surrounding prose brief and do not recreate the table in markdown.",
  "",
  "### Product Recommendations Use The Tool",
  "",
  "EVERY TIME you recommend, mention, or discuss specific mattress products, call the `product_search` tool. Do not render product cards as HTML. The catalog has already been injected into your prompt; the tool is only the UI surface for showing product cards.",
  "",
  "- Choose products from the injected CATALOG_DATA yourself. There is no external lookup.",
  "- Pass 1 to 6 exact products to `product_search.products`.",
  "- Copy values from the same catalog row. Do not invent names, prices, links, images, SKUs, or variant IDs.",
  "- Map catalog columns into product fields:",
  "  - Product name/title -> `title`",
  "  - Image 1 -> `image`",
  "  - Product Link -> `link`",
  "  - Shopify Variant ID -> `shopifyVariantId`",
  "  - Sale Price -> `salePrice`",
  "  - Regular Price -> `regularPrice`",
  "  - Brand/Theme/vendor -> `brand` when available",
  "  - Mattress Size -> `size`",
  "  - Mattress Type/category -> `category`",
  "  - One-line fit reason -> `summary`",
  "- Write at most one short setup sentence before the tool call and one short follow-up question after it.",
  "- If the shopper asks to compare the displayed products, use `compare_tool` with the same product objects.",
  "",
  "### Post-Product Follow-up",
  "",
  "After `product_search`, ask a brief natural-language follow-up. Do not create HTML action bars or HTML chips for product follow-up actions.",
].join("\n");

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
  stage: ConversationStage,
  options?: {
    systemPrompt?: string | null;
    skillPrompt?: string | null;
    pageContext?: PageContext;
    visitorProfile?: VisitorProfile;
    accessoryData?: string;
    interjectionType?: string;
    customerLocation?: CustomerLocation;
  }
): string {
  // Load universal rules
  const base = (options?.systemPrompt?.trim() || getDefaultSystemPrompt()).replace(
    "{{CATALOG_DATA}}",
    catalogData
  );

  // Load stage-specific skill
  const skill = stripLegacyHtmlInstructions(
    options?.skillPrompt?.trim() || getDefaultSkillPrompt(stage)
  );

  // Build human-readable context (always included when available)
  const contextNarrative = buildContextNarrative(
    options?.pageContext,
    options?.visitorProfile
  );

  // Inject accessory catalog for closing stage
  const accessoryBlock = options?.accessoryData
    ? `\n\n---\n\n${options.accessoryData}`
    : "";

  // For interjection stage, tell the skill which sub-template to use
  const interjectionBlock = options?.interjectionType
    ? `\n\n---\n\n# INTERJECTION TYPE\n\nUse the "${options.interjectionType}" sub-template from the skill above.`
    : "";

  const locationBlock = buildCustomerLocationBlock(options?.customerLocation);

  // Combine: universal rules + current stage skill + context + accessory data + location + output rules
  return `${base}\n\n---\n\n# ACTIVE SKILL\n\n${skill}${contextNarrative}${accessoryBlock}${interjectionBlock}${locationBlock}\n\n---\n\n${UI_INSTRUCTIONS}`;
}
