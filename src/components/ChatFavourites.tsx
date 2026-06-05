"use client";

import { Heart, ShoppingCart, Trash2, X } from "lucide-react";
import { addProductToCart, formatProductPrice } from "@/lib/product-actions";
import type { FavouriteProduct } from "@/lib/favourites-storage";
import { Button } from "@/components/ui/button";

function FavouriteItem({
  product,
  onRemove,
}: {
  product: FavouriteProduct;
  onRemove: () => void;
}) {
  const price = formatProductPrice(product);
  const meta = [product.brand, product.size, product.category]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="rounded-xl border border-[var(--widget-border)] bg-white p-3">
      <div className="flex gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--widget-surface-alt)]">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={product.title || "Product"}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-[var(--widget-user-bubble)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--widget-text)]">
            {product.title || "Catalog product"}
          </div>
          {meta ? (
            <div className="mt-1 line-clamp-1 text-[11px] uppercase text-[var(--widget-text-muted)]">
              {meta}
            </div>
          ) : null}
          <div className="mt-2 text-base font-bold leading-none text-destructive">
            {price}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--widget-text-muted)] transition-colors hover:bg-[var(--widget-surface-alt)] hover:text-[var(--widget-text)]"
          aria-label="Remove from favourites"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={!product.link && !product.shopifyVariantId}
        onClick={() => addProductToCart(product)}
        className="mt-3 w-full"
      >
        <ShoppingCart />
        Add to Cart
      </Button>
    </div>
  );
}

export function ChatFavourites({
  favourites,
  onRemoveFavourite,
  onClose,
}: {
  favourites: FavouriteProduct[];
  onRemoveFavourite: (productKey: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--widget-surface)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--widget-border)] px-4">
        <div className="flex items-center gap-2">
          <Heart size={15} className="fill-[var(--widget-danger)] text-[var(--widget-danger)]" />
          <span className="text-sm font-semibold text-[var(--widget-text)]">
            Favourites
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--widget-text-muted)] transition-colors hover:bg-[var(--widget-surface-alt)] hover:text-[var(--widget-text)]"
          aria-label="Close favourites"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {favourites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Heart
              size={32}
              className="mb-3 fill-[var(--widget-danger)] text-[var(--widget-danger)] opacity-40"
            />
            <p className="text-sm text-[var(--widget-text-muted)]">
              No favourites yet
            </p>
            <p className="mt-1 text-xs text-[var(--widget-text-muted)] opacity-70">
              Tap the heart on a product to save it here
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {favourites.map((product) => (
              <FavouriteItem
                key={product.productKey}
                product={product}
                onRemove={() => onRemoveFavourite(product.productKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
