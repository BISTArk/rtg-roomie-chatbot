import { CATALOG_RAW, CATALOG_ROWS } from "@/data/catalog-raw";

/**
 * Single source of truth: the `Upload sheet` in `updated rtg.xlsx`.
 *
 * Data is pre-parsed at build time by scripts/prebuild.mjs into
 * src/data/catalog-raw.ts so there's no runtime filesystem read.
 */
let cachedAccessories: string | null = null;

/** Full catalog as markdown for the system prompt (all categories). */
export function getCatalogData(): string {
  return CATALOG_RAW;
}

/**
 * Accessory-focused slice of the SAME catalog (no separate sheet). Used
 * during the closing / upsell stages so the prompt gets cross-sell context
 * without re-reading the full mattress table.
 *
 * Groups rows by the `Category` column and outputs readable sections in the
 * upsell order: LIFESTYLE_BASE → PROTECTOR → PILLOW → SHEETS. Each row
 * carries the same Shopify Variant ID from the Upload sheet, so Add-to-Cart
 * works the same way for any accessory as it does for a mattress.
 */
export function getAccessoryData(): string {
  if (cachedAccessories) return cachedAccessories;

  // Bucket rows by Category. We re-render each as a compact markdown line so
  // the AI can pluck them into product cards during cross-sell. Order here
  // controls the prompt section order the AI sees.
  const buckets: Record<string, string[]> = {
    LIFESTYLE_BASE: [],
    PROTECTOR: [],
    PILLOW: [],
    SHEETS: [],
  };

  for (const row of CATALOG_ROWS) {
    const cat = String(row["Category"] || "").trim();
    if (!cat || cat === "MATTRESS" || !(cat in buckets)) continue;
    const desc = String(row["Customer Description"] || "").trim();
    const sku = String(row["Sku Number"] || "").trim();
    const brand = String(row["Specialty Brand"] || "").trim();
    const salePrice = String(row["Sale Price"] || "").trim();
    const regPrice = String(row["Regular Price"] || "").trim();
    const size = String(row["Mattress Size"] || "").trim();
    const img = String(row["Image 1"] || "").trim();
    const link = String(row["Product Link"] || "").trim();
    const variantId = String(row["Shopify Variant ID"] || "").trim();
    const discount = String(row["Discount"] || "").trim();
    const discountPct = String(row["Discount %"] || "").trim();
    if (!desc && !sku) continue;
    const price =
      salePrice && regPrice && salePrice !== regPrice
        ? `$${salePrice} (reg $${regPrice})`
        : salePrice
          ? `$${salePrice}`
          : regPrice
            ? `$${regPrice}`
            : "n/a";
    const parts = [
      desc || "(no description)",
      brand ? `Brand: ${brand}` : null,
      size ? `Size: ${size}` : null,
      `Price: ${price}`,
      discount ? `Discount: ${discount}` : null,
      discount === "Yes" && discountPct ? `Discount %: ${discountPct}` : null,
      sku ? `SKU: ${sku}` : null,
      img ? `Image: ${img}` : null,
      link ? `Link: ${link}` : null,
      variantId ? `Shopify Variant ID: ${variantId}` : null,
    ].filter(Boolean);
    buckets[cat].push("- " + parts.join(" | "));
  }

  const out: string[] = ["# ACCESSORY CATALOG", ""];
  out.push(
    "All accessory products come from the same Upload sheet as the mattresses, filtered by the `Category` column. Use the Shopify Variant ID for Add to Cart exactly as you would for a mattress.",
    ""
  );

  // Output order matches the upsell cross-sell flow:
  // 1. Lifestyle Base  2. Protector  3. Pillow  4. Sheets

  if (buckets.LIFESTYLE_BASE.length) {
    out.push("## LIFESTYLE BASES");
    out.push(
      "Best suggested for customers with back discomfort, hip discomfort, reflux, snoring, or lifestyle upgrade (reading, TV, elevated legs). Match size to the customer's mattress.",
      "Tier guide:",
      "- BaseLogic Silver: Entry-level (head/foot articulation).",
      "- BaseLogic Platinum: Mid-tier (adds massage, USB, wireless remote).",
      "- Tempur-Ergo 3.0 / 3.0 Smart / ProSmart: Premium tier.",
      "- Adapt Pro-LO / Pro-HI / ProAdjust: Tempur-Pedic-compatible premium bases.",
      "- House-label performance tiers: merchant-specific premium adjustable-base lineup.",
      "- EASE 4.0: Stearns & Foster base option.",
      ""
    );
    out.push(...buckets.LIFESTYLE_BASE);
    out.push("");
  }

  if (buckets.PROTECTOR.length) {
    out.push("## MATTRESS PROTECTORS");
    out.push(
      "Three BEDGEAR tiers — always match the size to the customer's mattress size:",
      "- iProtect: Entry-level waterproof protection. Reliable, affordable.",
      "- Dri-Tec: Moisture-wicking, breathable. Default for most customers.",
      "- Ver-Tex: Premium breathable cover with active temperature management. Best for hot sleepers.",
      ""
    );
    out.push(...buckets.PROTECTOR);
    out.push("");
  }

  if (buckets.PILLOW.length) {
    out.push("## PILLOWS");
    out.push(
      "BEDGEAR loft number maps to sleep position:",
      "- 0.0 = Stomach sleepers (flattest)",
      "- 1.0 = Side sleepers, lighter build",
      "- 2.0 = Side sleepers, average/heavier (default for side sleepers)",
      "- 3.0 = Back sleepers",
      "- Combo sleepers → 2.0 default",
      "Night Ice: hot sleepers. Storm: all-around. Aspen: entry-level. Tempurpedic Breeze: premium hot-sleeper. Tempurpedic Adapt: premium conforming. Casper Snow: temperature-managed at mid-price.",
      ""
    );
    out.push(...buckets.PILLOW);
    out.push("");
  }

  if (buckets.SHEETS.length) {
    out.push("## SHEETS");
    out.push(
      "Match sheet size to the customer's mattress size. Reference the catalog rows below for exact products.",
      ""
    );
    out.push(...buckets.SHEETS);
    out.push("");
  }

  cachedAccessories = out.join("\n");
  return cachedAccessories;
}
