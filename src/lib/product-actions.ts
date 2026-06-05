import type { ProductCard } from "@/lib/product-types";

export function openProductLink(product: ProductCard) {
  if (!product.link || typeof window === "undefined") return;

  try {
    const parsed = new URL(product.link);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

    const productName =
      product.title || parsed.pathname.split("/").pop()?.replace(/-/g, " ") || "";

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "shop-assist-navigate",
          url: parsed.href,
          pendingProduct: productName
            ? { productName, url: parsed.href }
            : undefined,
        },
        "*"
      );
      return;
    }

    window.location.href = parsed.href;
  } catch {
    window.open(product.link, "_blank", "noopener,noreferrer");
  }
}

export function addProductToCart(product: ProductCard) {
  if (
    product.shopifyVariantId &&
    typeof window !== "undefined" &&
    window.parent &&
    window.parent !== window
  ) {
    window.parent.postMessage(
      {
        type: "shop-assist-add-to-cart",
        variantId: product.shopifyVariantId,
        quantity: 1,
      },
      "*"
    );
    return;
  }

  openProductLink(product);
}

export function formatProductPrice(product: ProductCard): string {
  if (product.salePrice) return `$${product.salePrice}`;
  if (product.regularPrice) return `$${product.regularPrice}`;
  return "Price unavailable";
}
