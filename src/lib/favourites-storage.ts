import { getScopedStorageKey, setStorageNamespace } from "@/lib/browser-session";
import {
  getProductKey,
  type ProductCard,
  type SelectableProductCard,
} from "@/lib/product-types";

const STORAGE_KEY = "favourites";

export type FavouriteProduct = SelectableProductCard & {
  savedAt: string;
};

let favouritesCache: FavouriteProduct[] = [];
let embedded = false;
let initialized = false;

function postToParent(type: string, data: Record<string, unknown> = {}) {
  if (!embedded) return;
  try {
    window.parent.postMessage({ type, ...data }, "*");
  } catch {
    // cross-origin or no parent
  }
}

export function configureFavouritesStorageNamespace(
  namespace: string | null | undefined
) {
  setStorageNamespace(namespace);
}

export function initFavouritesFromBridge(
  favourites: FavouriteProduct[] | null,
  isEmbed: boolean
) {
  embedded = isEmbed;
  if (favourites && favourites.length > 0) {
    favouritesCache = favourites;
  }
  initialized = true;
}

export function isFavouritesInitialized(): boolean {
  return initialized;
}

function normalizeFavourite(product: FavouriteProduct): FavouriteProduct | null {
  const productKey = product.productKey?.trim();
  if (!productKey) return null;
  return {
    ...product,
    productKey,
    savedAt: product.savedAt || new Date().toISOString(),
  };
}

export function saveFavourites(favourites: FavouriteProduct[]) {
  favouritesCache = favourites;

  if (embedded) {
    postToParent("shop-assist-save-favourites", { favourites });
  } else {
    try {
      localStorage.setItem(
        getScopedStorageKey(STORAGE_KEY),
        JSON.stringify(favourites)
      );
    } catch {
      // quota
    }
  }
}

export function loadFavourites(): FavouriteProduct[] {
  if (embedded) {
    return favouritesCache;
  }

  if (favouritesCache.length > 0) return favouritesCache;
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((item) => normalizeFavourite(item as FavouriteProduct))
      .filter((item): item is FavouriteProduct => Boolean(item));
    favouritesCache = normalized;
    return normalized;
  } catch {
    return [];
  }
}

export function toFavouriteProduct(
  product: SelectableProductCard
): FavouriteProduct {
  return {
    ...product,
    productKey: product.productKey || getProductKey(product),
    savedAt: new Date().toISOString(),
  };
}

export function toggleFavouriteInList(
  favourites: FavouriteProduct[],
  product: SelectableProductCard
): FavouriteProduct[] {
  const productKey = product.productKey || getProductKey(product);
  const exists = favourites.some((item) => item.productKey === productKey);
  if (exists) {
    return favourites.filter((item) => item.productKey !== productKey);
  }
  return [toFavouriteProduct({ ...product, productKey }), ...favourites];
}

export function removeFavouriteFromList(
  favourites: FavouriteProduct[],
  productKey: string
): FavouriteProduct[] {
  return favourites.filter((item) => item.productKey !== productKey);
}

export function isProductFavourited(
  favourites: FavouriteProduct[],
  productKey: string
): boolean {
  return favourites.some((item) => item.productKey === productKey);
}

export function productCardFromFavourite(product: FavouriteProduct): ProductCard {
  return {
    title: product.title,
    category: product.category,
    brand: product.brand,
    size: product.size,
    salePrice: product.salePrice,
    regularPrice: product.regularPrice,
    image: product.image,
    link: product.link,
    sku: product.sku,
    summary: product.summary,
    shopifyVariantId: product.shopifyVariantId,
  };
}
