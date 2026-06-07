export type ProductCard = {
  title?: string;
  category?: string;
  brand?: string;
  size?: string;
  salePrice?: string;
  regularPrice?: string;
  image?: string;
  link?: string;
  sku?: string;
  summary?: string;
  shopifyVariantId?: string;
};

export type SelectableProductCard = ProductCard & {
  productKey: string;
};

export function getProductKey(
  product: ProductCard,
  fallbackIndex?: number
): string {
  const key = (product.sku || product.title || "").trim();
  if (key) return key;
  if (typeof fallbackIndex === "number") return `product-${fallbackIndex}`;
  return `product-${Date.now()}`;
}
