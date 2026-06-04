"use client";

import { useRef, useEffect, useState } from "react";
import type { WidgetTheme } from "@/lib/widget-config";

const IFRAME_BRIDGE_SCRIPT = `
<script>
  function sendPrompt(text) {
    window.parent.postMessage({ type: 'shop-assist-send-prompt', text: text }, '*');
  }

  var _selected = new Set();

  function toggleSelect(el, value) {
    if (_selected.has(value)) {
      _selected.delete(value);
      el.classList.remove('selected');
    } else {
      _selected.add(value);
      el.classList.add('selected');
    }
  }

  function submitSelected(prefix) {
    if (_selected.size === 0) return;
    var items = Array.from(_selected);
    var text = (prefix || '') + items.join(', ');
    window.parent.postMessage({ type: 'shop-assist-send-prompt', text: text.trim() }, '*');
  }

  function openProduct(url, productName) {
    if (!url) return;
    window.parent.postMessage({ type: 'shop-assist-open-url', url: String(url).trim(), productName: productName || '' }, '*');
  }

  function addToCart(variantId, quantity) {
    var q = quantity == null || quantity === '' ? 1 : Number(quantity);
    if (!(q >= 1) || q > 99) q = 1;
    window.parent.postMessage({
      type: 'shop-assist-add-to-cart',
      variantId: variantId,
      quantity: Math.floor(q)
    }, '*');
  }

  function checkout() {
    window.parent.postMessage({ type: 'shop-assist-checkout' }, '*');
  }

  function askSimilar(productName) {
    var name = String(productName || '').trim();
    if (!name) return;
    sendPrompt('Show me products similar to ' + name);
  }

  function toggleWishlist(btn) {
    if (!btn) return;
    btn.classList.toggle('active');
  }

  function measuredHeight() {
    return Math.max(
      document.body.scrollHeight || 0,
      document.body.offsetHeight || 0
    );
  }

  var _lastSent = 0;
  function notifyHeight() {
    var h = measuredHeight() + 2;
    if (Math.abs(h - _lastSent) < 2) return;
    _lastSent = h;
    window.parent.postMessage({ type: 'shop-assist-iframe-resize', height: h }, '*');
  }

  new MutationObserver(notifyHeight).observe(document.body, {
    childList: true, subtree: true, attributes: true
  });

  if (typeof ResizeObserver !== 'undefined') {
    try {
      new ResizeObserver(function () { notifyHeight(); }).observe(document.body);
    } catch (_) { /* ignore */ }
  }

  window.addEventListener('load', notifyHeight);

  function hookImages() {
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.__shopAssistHooked) continue;
      img.__shopAssistHooked = true;
      img.addEventListener('load', notifyHeight);
      img.addEventListener('error', notifyHeight);
    }
  }
  hookImages();
  new MutationObserver(hookImages).observe(document.body, {
    childList: true, subtree: true
  });

  function ensureWishlistButtons() {
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var media = card.querySelector('.card-media');
      if (!media || media.querySelector('.card-wishlist-btn')) continue;

      var title = card.querySelector('.card-title');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-wishlist-btn';
      btn.setAttribute('aria-label', 'Add to wishlist');
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleWishlist(event.currentTarget);
      });
      media.appendChild(btn);
    }
  }
  ensureWishlistButtons();
  new MutationObserver(function () {
    ensureWishlistButtons();
    notifyHeight();
  }).observe(document.body, {
    childList: true, subtree: true
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(notifyHeight).catch(function () {});
  }

  [10, 100, 300, 800, 1500].forEach(function (ms) {
    setTimeout(notifyHeight, ms);
  });
</script>
`;

function sanitizeCssValue(value: string): string {
  return value.replace(/[^#(),.%/\-\w\s]/g, "");
}

function buildIframeBaseStyles(theme: WidgetTheme): string {
  const accent = sanitizeCssValue(theme.accent);
  const accentHover = sanitizeCssValue(theme.accentHover);
  const accentText = sanitizeCssValue(theme.accentText);
  const surface = sanitizeCssValue(theme.surface);
  const surfaceAlt = sanitizeCssValue(theme.surfaceAlt);
  const text = sanitizeCssValue(theme.text);
  const textMuted = sanitizeCssValue(theme.textMuted);
  const border = sanitizeCssValue(theme.border);
  const success = sanitizeCssValue(theme.success);
  const focus = sanitizeCssValue(theme.focus);
  const fontFamily = sanitizeCssValue(theme.fontFamily);
  const radius = sanitizeCssValue(theme.radius);

  return `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: ${fontFamily};
    font-size: 14px;
    line-height: 1.5;
    color: ${text};
    background: transparent;
    overflow: hidden;
    height: auto;
  }
  body { padding: 0; }

  .pill, .chip, [data-prompt] {
    display: inline-block;
    padding: 6px 14px;
    margin: 3px;
    border-radius: 999px;
    border: none;
    color: ${text};
    background: ${surface};
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }
  .pill:hover, .chip:hover, [data-prompt]:hover {
    background: ${surfaceAlt};
  }
  .pill:active, .chip:active, [data-prompt]:active {
    transform: scale(0.97);
  }
  .pill.selected, .chip.selected {
    background: ${accent};
    color: ${accentText};
    font-weight: 700;
    transform: translateY(-1px);
  }
  .pill.selected::after, .chip.selected::after {
    content: "  ✓";
    font-weight: 700;
  }

  .card {
    border: 1px solid ${border};
    border-radius: ${radius};
    display: flex;
    flex-direction: column;
    margin: 4px 0;
    background: ${surface};
    overflow: hidden;
  }
  .card-top {
    display: flex;
    align-items: stretch;
    gap: 14px;
    padding: 14px 16px;
  }
  .card-media {
    position: relative;
    flex: 0 0 92px;
    width: 92px;
    cursor: pointer;
    border-radius: calc(${radius} - 2px);
    overflow: hidden;
    background: ${surfaceAlt};
  }
  .card-media:focus-visible { outline: 2px solid ${focus}; outline-offset: 2px; }
  .card-image {
    width: 100%;
    height: 132px;
    object-fit: contain;
    display: block;
    padding: 8px 4px;
  }
  .card-wishlist-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid ${border};
    background: rgba(255, 255, 255, 0.96);
    cursor: pointer;
    padding: 0;
  }
  .card-wishlist-btn::before {
    content: "";
    display: block;
    width: 14px;
    height: 14px;
    margin: 6px auto 0;
    background: ${text};
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.4l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z'/%3E%3C/svg%3E") center / contain no-repeat;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Cpath d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.4l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z'/%3E%3C/svg%3E") center / contain no-repeat;
  }
  .card-wishlist-btn.active::before {
    background: ${accent};
  }
  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
  }
  .card-title {
    font-weight: 700;
    font-size: 13px;
    line-height: 1.35;
    color: ${text};
    text-transform: uppercase;
    letter-spacing: 0.01em;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .card-actions-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .card-price {
    font-weight: 700;
    color: ${accent};
    font-size: 18px;
    line-height: 1.2;
    white-space: nowrap;
  }
  .card-buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
  }
  .card-footer {
    border-top: 1px solid ${border};
    padding: 10px 16px 12px;
    font-size: 13px;
    line-height: 1.45;
    color: ${textMuted};
  }
  .card-footer strong {
    color: ${text};
    font-weight: 700;
  }
  .card-tag {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    margin: 0;
  }
  .tag-premium { background: #f4eadb; color: #9a6a1f; }
  .tag-value { background: #ebf5ec; color: #2e7d32; }
  .tag-cooling { background: #e7f1f9; color: #1f5e90; }
  .card-buttons .btn-outline,
  .card-buttons .btn-cart {
    font-size: 13px !important;
    padding: 8px 12px;
    border-radius: 6px;
  }
  .btn-outline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: ${surface};
    color: ${text};
    border: 1px solid ${border};
    padding: 8px 12px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 13px;
    line-height: 1.15;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .btn-outline:hover { background: ${surfaceAlt}; }
  .btn-compare::before {
    content: "";
    width: 14px;
    height: 14px;
    background: currentColor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Crect x='3' y='12' width='4' height='8' rx='1'/%3E%3Crect x='10' y='8' width='4' height='12' rx='1'/%3E%3Crect x='17' y='4' width='4' height='16' rx='1'/%3E%3C/svg%3E") center / contain no-repeat;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Crect x='3' y='12' width='4' height='8' rx='1'/%3E%3Crect x='10' y='8' width='4' height='12' rx='1'/%3E%3Crect x='17' y='4' width='4' height='16' rx='1'/%3E%3C/svg%3E") center / contain no-repeat;
  }
  .btn-cart {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: ${accent};
    color: ${accentText};
    border: none;
    padding: 8px 12px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 13px;
    line-height: 1.15;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .btn-cart::before {
    content: "";
    width: 14px;
    height: 14px;
    background: currentColor;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Ccircle cx='9' cy='20' r='1'/%3E%3Ccircle cx='18' cy='20' r='1'/%3E%3Cpath d='M2 2h2l2.7 12.9a2 2 0 0 0 2 1.7h9.7a2 2 0 0 0 2-1.7L22 6H6'/%3E%3C/svg%3E") center / contain no-repeat;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Ccircle cx='9' cy='20' r='1'/%3E%3Ccircle cx='18' cy='20' r='1'/%3E%3Cpath d='M2 2h2l2.7 12.9a2 2 0 0 0 2 1.7h9.7a2 2 0 0 0 2-1.7L22 6H6'/%3E%3C/svg%3E") center / contain no-repeat;
  }
  .btn-cart:hover { background: ${accentHover}; }

  button { font-family: inherit; }
  .btn-primary {
    background: ${accent}; color: ${accentText}; border: none;
    padding: 8px 16px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; transition: background 0.15s;
  }
  .btn-primary:hover { background: ${accentHover}; }
  .btn-secondary {
    background: ${surface}; color: ${text}; border: 1px solid ${border};
    padding: 8px 16px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; transition: all 0.15s;
  }
  .btn-secondary:hover { background: ${surfaceAlt}; }
  .btn-submit {
    display: block;
    margin-top: 8px;
    background: ${accent}; color: ${accentText}; border: none;
    padding: 8px 20px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; transition: background 0.15s;
    width: 100%;
  }
  .btn-submit:hover { background: ${accentHover}; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .flex-wrap { display: flex; flex-wrap: wrap; gap: 4px; }
</style>
`;
}

interface InlineHTMLProps {
  html: string;
  id: string;
  theme: WidgetTheme;
  className?: string;
}

export function InlineHTML({ html, id, theme, className }: InlineHTMLProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(40);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "shop-assist-iframe-resize" && iframeRef.current) {
        if (e.source === iframeRef.current.contentWindow) {
          setHeight(Math.min(Math.max(e.data.height, 20), 2000));
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${buildIframeBaseStyles(theme)}
</head><body>
${html}
${IFRAME_BRIDGE_SCRIPT}
</body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      title={`Interactive content ${id}`}
      className={`my-0.5 w-full border-0 ${className ?? ""}`}
      style={{
        height: `${height}px`,
        background: "transparent",
        overflow: "hidden",
        display: "block",
        borderRadius: "8px",
      }}
    />
  );
}
