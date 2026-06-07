import { tool } from "ai";
import { z } from "zod";

const productSchema = z.object({
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
  shopifyVariantId: z.string().optional(),
});

export const productSearchTool = tool({
  description:
    "Render product cards from the catalog context already provided in the prompt. This tool does not search externally. Call it whenever you recommend, mention, or discuss specific catalog products. Pass only products copied from the injected catalog rows.",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Short description of the shopper's product request or constraints."),
    products: z
      .array(productSchema)
      .min(1)
      .max(6)
      .describe("Catalog products to display as cards. Values must come from the catalog context."),
  }),
  execute: async ({ query, products }) => {
    return {
      query: query || "",
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
  },
});
