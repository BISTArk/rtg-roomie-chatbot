import type { ShopAssistChatConfig } from "@/lib/widget-config";

declare global {
  interface Window {
    SHOP_ASSIST_CONFIG?: ShopAssistChatConfig;
  }
}

export {};
