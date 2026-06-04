import { tool } from "ai";
import { z } from "zod";

const compareProductSchema = z.object({
  title: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  salePrice: z.string().optional(),
  regularPrice: z.string().optional(),
  image: z.string().optional(),
  link: z.string().optional(),
  sku: z.string().optional(),
  summary: z.string().optional(),
});

const recommendationSchema = z.object({
  productSku: z
    .string()
    .optional()
    .describe("SKU of the recommended product when one option is the strongest fit."),
  productTitle: z
    .string()
    .optional()
    .describe("Product title of the recommended option if SKU is unavailable."),
  reason: z
    .string()
    .describe("Short shopper-facing explanation for why this is the recommended choice."),
  label: z
    .string()
    .optional()
    .describe("Optional heading for the recommendation card. Defaults to 'Our Recommendation'."),
});

type CompareProduct = z.infer<typeof compareProductSchema>;

function normalizeText(value?: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePrice(value?: string) {
  if (!value) return Number.NaN;
  const normalized = value.replace(/[^0-9.]+/g, "");
  return normalized ? Number(normalized) : Number.NaN;
}

function formatPrice(product: CompareProduct) {
  const price = product.salePrice || product.regularPrice || "";
  if (!price) return "Unavailable";
  const parsed = parsePrice(price);
  if (!Number.isFinite(parsed)) return price.trim();
  return `$${String(parsed)}`;
}

function getHighlights(products: CompareProduct[]) {
  const withPrices = products
    .map((product, index) => ({
      index,
      price: parsePrice(product.salePrice || product.regularPrice),
    }))
    .filter((entry) => Number.isFinite(entry.price));

  const cheapest =
    withPrices.length > 0
      ? withPrices.reduce((best, current) => (current.price < best.price ? current : best))
      : null;
  const priciest =
    withPrices.length > 0
      ? withPrices.reduce((best, current) => (current.price > best.price ? current : best))
      : null;

  return {
    cheapestIndex: cheapest?.index ?? -1,
    priciestIndex: priciest?.index ?? -1,
  };
}

function buildRows(products: CompareProduct[]) {
  const maxSummaryLength = 120;

  return [
    {
      label: "Price",
      values: products.map((product) => formatPrice(product)),
    },
    {
      label: "Availability",
      values: products.map((product) => (product.link ? "In Stock" : "Unavailable")),
    },
    {
      label: "Brand",
      values: products.map((product) => product.brand || "Unknown"),
    },
    {
      label: "Size",
      values: products.map((product) => product.size || "Unknown"),
    },
    {
      label: "Category",
      values: products.map((product) => product.category || "Unknown"),
    },
    {
      label: "Why it fits",
      values: products.map((product) => {
        const summary = (product.summary || "").trim();
        if (!summary) return "No summary available";
        return summary.length > maxSummaryLength
          ? `${summary.slice(0, maxSummaryLength).trim()}...`
          : summary;
      }),
    },
  ];
}

export const compareTool = tool({
  description:
    "Compare 2 to 4 specific catalog products that have already been shortlisted. Use this after recommendations when the shopper wants side-by-side tradeoffs. Include recommendation when one option is the strongest fit.",
  inputSchema: z.object({
    shopperGoal: z
      .string()
      .optional()
      .describe("Optional short description of what the shopper cares about in this comparison."),
    products: z
      .array(compareProductSchema)
      .min(2)
      .max(4)
      .describe("The exact products to compare side by side."),
    recommendation: recommendationSchema
      .optional()
      .describe("Optional recommendation for the best-fit product after comparing the shortlist."),
  }),
  execute: async ({ shopperGoal, products, recommendation }) => {
    const normalizedProducts = products.map((product) => ({
      ...product,
      title: product.title || "Catalog product",
      category: product.category || "",
      brand: product.brand || "",
      size: product.size || "",
      salePrice: product.salePrice || "",
      regularPrice: product.regularPrice || "",
      image: product.image || "",
      link: product.link || "",
      sku: product.sku || "",
      summary: product.summary || "",
    }));

    const highlights = getHighlights(normalizedProducts);
    const recommendationTitle = normalizeText(recommendation?.productTitle);
    const recommendedProduct = recommendation
      ? normalizedProducts.find((product) => {
          const productTitle = normalizeText(product.title);
          return (
            (recommendation.productSku && product.sku === recommendation.productSku) ||
            (recommendationTitle &&
              (productTitle === recommendationTitle ||
                productTitle.includes(recommendationTitle) ||
                recommendationTitle.includes(productTitle)))
          );
        }) || null
      : null;

    return {
      shopperGoal: shopperGoal || "",
      products: normalizedProducts,
      rows: buildRows(normalizedProducts),
      highlights,
      recommendation: recommendation
        ? {
            label: recommendation.label || "Our Recommendation",
            reason: recommendation.reason,
            productTitle: recommendedProduct?.title || recommendation.productTitle || "",
            productSku: recommendedProduct?.sku || recommendation.productSku || "",
            link: recommendedProduct?.link || "",
          }
        : null,
    };
  },
});
