const DEFAULT_NAMESPACE = "shop-assist-demo";

let storageNamespace = DEFAULT_NAMESPACE;

function safeWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

export function setStorageNamespace(namespace: string | null | undefined) {
  const next = String(namespace || "").trim();
  storageNamespace = next || DEFAULT_NAMESPACE;
}

export function getStorageNamespace(): string {
  return storageNamespace;
}

export function getScopedStorageKey(baseKey: string): string {
  return `${storageNamespace}:${baseKey}`;
}

function uid(): string {
  return `shopassist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createBrowserSessionId(): string {
  return uid();
}

export function getBrowserSessionId(): string {
  const win = safeWindow();
  if (!win) return uid();
  const key = getScopedStorageKey("session_id");
  try {
    const existing = win.localStorage.getItem(key);
    if (existing) return existing;
    const next = uid();
    win.localStorage.setItem(key, next);
    return next;
  } catch {
    return uid();
  }
}

export function setBrowserSessionId(sessionId: string) {
  const win = safeWindow();
  if (!win) return;
  const key = getScopedStorageKey("session_id");
  try {
    win.localStorage.setItem(key, sessionId);
  } catch {
    // ignore storage errors
  }
}
