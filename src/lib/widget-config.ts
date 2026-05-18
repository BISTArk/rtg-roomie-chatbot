import type { CSSProperties } from "react";

export type LogoMode = "none" | "initials" | "image";
export type WidgetPlacement = "bottom-right" | "bottom-left";

export interface WidgetTheme {
  accent: string;
  accentHover: string;
  accentText: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  overlay: string;
  userBubble: string;
  assistantBubble: string;
  success: string;
  danger: string;
  focus: string;
  fontFamily: string;
  radius: string;
  shadow: string;
}

export interface WidgetBranding {
  assistantName: string;
  launcherLabel: string;
  headerTitle: string;
  inputPlaceholder: string;
  humanModeBannerText: string;
  quickChips: string[];
  logoMode: LogoMode;
  logoUrl?: string;
  logoAlt?: string;
}

export interface ShopAssistChatConfig {
  tenantKey?: string;
  placement?: WidgetPlacement;
  theme?: Partial<WidgetTheme>;
  branding?: Partial<WidgetBranding>;
}

export interface ResolvedWidgetConfig {
  theme: WidgetTheme;
  branding: WidgetBranding;
}

export const DEFAULT_WIDGET_THEME: WidgetTheme = {
  accent: "#1f1f1f",
  accentHover: "#343434",
  accentText: "#ffffff",
  surface: "#ffffff",
  surfaceAlt: "#f6f6f4",
  text: "#1a1a1a",
  textMuted: "#5f5f5f",
  border: "#e7e3dd",
  overlay: "rgba(0, 0, 0, 0.12)",
  userBubble: "#ece9e2",
  assistantBubble: "#f6f6f4",
  success: "#2f7d32",
  danger: "#c94a4a",
  focus: "#1f1f1f",
  fontFamily: "Jost, Inter, Helvetica Neue, Arial, sans-serif",
  radius: "24px",
  shadow: "0 18px 50px rgba(17, 24, 39, 0.18)",
};

export const DEFAULT_WIDGET_BRANDING: WidgetBranding = {
  assistantName: "Shopping Assistant",
  launcherLabel: "Shopping Assistant",
  headerTitle: "Shopping Assistant",
  inputPlaceholder: "Ask about mattresses...",
  humanModeBannerText:
    "You are now connected to a human agent. Refresh to resume AI assistant.",
  quickChips: [
    "Help me find the right fit",
    "My back has been hurting",
    "Just browsing",
    "Show me popular picks",
  ],
  logoMode: "initials",
  logoAlt: "Shopping Assistant",
};

export const SHOP_ASSIST_WIDGET_THEME: WidgetTheme = {
  accent: "#003DA5",
  accentHover: "#002D7A",
  accentText: "#ffffff",
  surface: "#ffffff",
  surfaceAlt: "#f7f7f7",
  text: "#1a1a1a",
  textMuted: "#4a4a4a",
  border: "#e5e5e5",
  overlay: "rgba(0, 0, 0, 0.1)",
  userBubble: "#e8eff8",
  assistantBubble: "#f7f7f7",
  success: "#2e7d32",
  danger: "#e4002b",
  focus: "#003DA5",
  fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
  radius: "24px",
  shadow: "0 18px 48px rgba(0, 0, 0, 0.18)",
};

export const SHOP_ASSIST_WIDGET_BRANDING: WidgetBranding = {
  assistantName: "Shop Assist",
  launcherLabel: "Shop Assist",
  headerTitle: "Shop Assist",
  inputPlaceholder: "Ask about mattresses...",
  humanModeBannerText:
    "You are now connected to a human agent. Refresh to resume AI assistant.",
  quickChips: [
    "Help me find the right fit",
    "My back has been hurting",
    "Just browsing",
    "What's popular?",
  ],
  logoMode: "initials",
  logoAlt: "Shop Assist",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return items.length > 0 ? items : fallback;
}

function pickLogoMode(value: unknown, fallback: LogoMode): LogoMode {
  return value === "none" || value === "initials" || value === "image"
    ? value
    : fallback;
}

function sanitizeTheme(theme: unknown): Partial<WidgetTheme> {
  const record = asRecord(theme);
  if (!record) return {};

  return {
    accent: pickString(record.accent, DEFAULT_WIDGET_THEME.accent),
    accentHover: pickString(record.accentHover, DEFAULT_WIDGET_THEME.accentHover),
    accentText: pickString(record.accentText, DEFAULT_WIDGET_THEME.accentText),
    surface: pickString(record.surface, DEFAULT_WIDGET_THEME.surface),
    surfaceAlt: pickString(record.surfaceAlt, DEFAULT_WIDGET_THEME.surfaceAlt),
    text: pickString(record.text, DEFAULT_WIDGET_THEME.text),
    textMuted: pickString(record.textMuted, DEFAULT_WIDGET_THEME.textMuted),
    border: pickString(record.border, DEFAULT_WIDGET_THEME.border),
    overlay: pickString(record.overlay, DEFAULT_WIDGET_THEME.overlay),
    userBubble: pickString(record.userBubble, DEFAULT_WIDGET_THEME.userBubble),
    assistantBubble: pickString(record.assistantBubble, DEFAULT_WIDGET_THEME.assistantBubble),
    success: pickString(record.success, DEFAULT_WIDGET_THEME.success),
    danger: pickString(record.danger, DEFAULT_WIDGET_THEME.danger),
    focus: pickString(record.focus, DEFAULT_WIDGET_THEME.focus),
    fontFamily: pickString(record.fontFamily, DEFAULT_WIDGET_THEME.fontFamily),
    radius: pickString(record.radius, DEFAULT_WIDGET_THEME.radius),
    shadow: pickString(record.shadow, DEFAULT_WIDGET_THEME.shadow),
  };
}

function sanitizeBranding(branding: unknown): Partial<WidgetBranding> {
  const record = asRecord(branding);
  if (!record) return {};

  return {
    assistantName: pickString(record.assistantName, DEFAULT_WIDGET_BRANDING.assistantName),
    launcherLabel: pickString(record.launcherLabel, DEFAULT_WIDGET_BRANDING.launcherLabel),
    headerTitle: pickString(record.headerTitle, DEFAULT_WIDGET_BRANDING.headerTitle),
    inputPlaceholder: pickString(record.inputPlaceholder, DEFAULT_WIDGET_BRANDING.inputPlaceholder),
    humanModeBannerText: pickString(
      record.humanModeBannerText,
      DEFAULT_WIDGET_BRANDING.humanModeBannerText
    ),
    quickChips: pickStringArray(record.quickChips, DEFAULT_WIDGET_BRANDING.quickChips),
    logoMode: pickLogoMode(record.logoMode, DEFAULT_WIDGET_BRANDING.logoMode),
    logoUrl: typeof record.logoUrl === "string" && record.logoUrl.trim() ? record.logoUrl.trim() : undefined,
    logoAlt: typeof record.logoAlt === "string" && record.logoAlt.trim() ? record.logoAlt.trim() : undefined,
  };
}

export function resolveWidgetConfig(config?: unknown): ResolvedWidgetConfig {
  const record = asRecord(config);
  const theme = sanitizeTheme(record?.theme);
  const branding = sanitizeBranding(record?.branding);

  return {
    theme: {
      ...DEFAULT_WIDGET_THEME,
      ...theme,
    },
    branding: {
      ...DEFAULT_WIDGET_BRANDING,
      ...branding,
    },
  };
}

export function mergeWidgetConfigLayers(
  ...configs: Array<ShopAssistChatConfig | null | undefined>
): ResolvedWidgetConfig {
  return configs.reduce<ResolvedWidgetConfig>(
    (resolved, config) => {
      if (!config) return resolved;
      const next = resolveWidgetConfig(config);
      return {
        theme: {
          ...resolved.theme,
          ...next.theme,
        },
        branding: {
          ...resolved.branding,
          ...next.branding,
        },
      };
    },
    {
      theme: { ...DEFAULT_WIDGET_THEME },
      branding: { ...DEFAULT_WIDGET_BRANDING },
    }
  );
}

export function getWindowChatConfig(): ShopAssistChatConfig | undefined {
  if (typeof window === "undefined") return undefined;
  const config = window.SHOP_ASSIST_CONFIG;
  return config && typeof config === "object" ? config : undefined;
}

export function getWelcomeMessage(branding: WidgetBranding): string {
  const name = branding.assistantName.trim();
  const roleLikeName = /\b(assistant|advisor|guide|helper|specialist)\b/i.test(name);
  const intro = roleLikeName ? `I'm your ${name.toLowerCase()}` : `I'm ${name}`;
  return `Hi there! ${intro}. Looking for a new mattress, or just exploring your options?`;
}

export function buildWidgetThemeStyle(theme: WidgetTheme): CSSProperties {
  return {
    "--widget-accent": theme.accent,
    "--widget-accent-hover": theme.accentHover,
    "--widget-accent-text": theme.accentText,
    "--widget-surface": theme.surface,
    "--widget-surface-alt": theme.surfaceAlt,
    "--widget-text": theme.text,
    "--widget-text-muted": theme.textMuted,
    "--widget-border": theme.border,
    "--widget-overlay": theme.overlay,
    "--widget-user-bubble": theme.userBubble,
    "--widget-assistant-bubble": theme.assistantBubble,
    "--widget-success": theme.success,
    "--widget-danger": theme.danger,
    "--widget-focus": theme.focus,
    "--widget-font-family": theme.fontFamily,
    "--widget-radius": theme.radius,
    "--widget-shadow": theme.shadow,
    color: theme.text,
    fontFamily: theme.fontFamily,
  } as CSSProperties;
}
