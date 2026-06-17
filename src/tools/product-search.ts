import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output, tool } from "ai";
import { z } from "zod";
import { CATALOG_AGENT_MODEL_ID } from "@/lib/models";
import type { CatalogDataset } from "@/lib/platform-types";
import { buildFullCatalogSnapshot } from "@/lib/tenant-catalog";

function buildCatalogPrompt(dataset: CatalogDataset): string {
  if (dataset.fullCatalogText?.trim()) {
    return dataset.fullCatalogText.trim();
  }

  return buildFullCatalogSnapshot(dataset);
}

const productCardSchema = z.object({
  title: z.string().min(1),
  category: z.string().optional(),
  brand: z.string().optional(),
  size: z.string().optional(),
  salePrice: z.string().optional(),
  regularPrice: z.string().optional(),
  image: z.string().optional(),
  link: z.string().optional(),
  sku: z.string().optional(),
  summary: z.string().max(240).optional(),
  shopifyVariantId: z.string().optional(),
});

const catalogAgentResultSchema = z.object({
  products: z.array(productCardSchema).max(6),
});

export function createProductSearchTool(input: {
  catalogDataset: CatalogDataset | null;
  conversationContext?: string;
  pageContextSummary?: string;
}) {
  return tool({
    description:
      "Find and display relevant catalog products for the shopper. This tool runs a dedicated catalog retrieval agent against the full store catalog and returns matching product cards. Call it whenever you need to recommend, mention, or show specific products.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          "The shopper request, constraints, and intent to match against the full catalog. Include size, budget, brand, comfort, and feature preferences when known."
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Maximum number of product cards to return."),
    }),
    execute: async ({ query, maxResults }) => {
      if (!input.catalogDataset || input.catalogDataset.rows.length === 0) {
        return {
          query,
          products: [],
          error: "No active catalog snapshot is available for this store yet.",
        };
      }

      const resultLimit = Math.min(Math.max(maxResults ?? 4, 1), 6);
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return { query, products: [] };
      }

      const apiKey = process.env.OPENROUTER_API_KEY?.trim();
      if (!apiKey) {
        console.error("[product-search] OPENROUTER_API_KEY is missing");
        return {
          query,
          products: [],
          error: "Catalog retrieval is unavailable right now.",
        };
      }

      const catalogPrompt = buildCatalogPrompt(input.catalogDataset);
      const contextBlocks = [
        input.pageContextSummary
          ? `Current page context:\n${input.pageContextSummary}`
          : "",
        input.conversationContext
          ? `Recent conversation:\n${input.conversationContext}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      try {
        const result = await generateText({
          model: createOpenRouter({ apiKey }).chat(CATALOG_AGENT_MODEL_ID),
          output: Output.object({
            schema: catalogAgentResultSchema,
            name: "catalog_product_results",
            description:
              "Best matching catalog products for the shopper request as final product card objects.",
          }),
          prompt: [
            "You are a catalog retrieval agent for a mattress storefront.",
            "Select the best matching products for the shopper request and return the final product card objects.",
            "The full active store catalog is included below — search across every product row, not just a sample.",
            "Copy exact product fields from the catalog below — title, prices, image URL, product link, SKU, and Shopify variant ID must match the catalog row.",
            "Prefer exact product/variant matches when possible.",
            "Respect size, brand, budget, and feature constraints from the shopper request and conversation.",
            "Write a short summary in each product's summary field explaining why it fits the shopper.",
            "Never invent products, prices, links, SKUs, or variant IDs.",
            `Return at most ${resultLimit} products.`,
            "",
            contextBlocks,
            "",
            `Shopper request:\n${trimmedQuery}`,
            "",
            "Full catalog:",
            catalogPrompt,
          ]
            .filter(Boolean)
            .join("\n"),
        });

        const products = result.output.products.slice(0, resultLimit);

        return {
          query,
          products: products.map((product) => ({
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
            shopifyVariantId: product.shopifyVariantId || "",
          })),
        };
      } catch (error) {
        console.error("[product-search] catalog retrieval failed:", error);
        return {
          query,
          products: [],
          error: "Catalog retrieval failed.",
        };
      }
    },
  });
}
