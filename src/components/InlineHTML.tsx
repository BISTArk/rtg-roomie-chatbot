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

  function enhanceProductCards() {
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__shopAssistEnhanced) continue;
      card.__shopAssistEnhanced = true;

      var media = card.querySelector('.card-media');
      var title = card.querySelector('.card-title');
      if (!media || !title) continue;

      media.style.position = 'relative';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-similar-btn';
      btn.setAttribute('aria-label', 'Show products similar to ' + title.textContent.trim());
      btn.textContent = '+';
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var parentCard = event.currentTarget.closest('.card');
        var parentTitle = parentCard ? parentCard.querySelector('.card-title') : null;
        var productName = parentTitle ? parentTitle.textContent : '';
        askSimilar(productName);
      });
      media.appendChild(btn);
    }
  }
  function groupCardTags() {
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.__rtgTagsGrouped) continue;

      var tags = Array.prototype.slice.call(card.querySelectorAll(':scope > .card-tag'));
      if (!tags.length) continue;

      var row = document.createElement('div');
      row.className = 'card-tag-row';
      tags[0].before(row);
      for (var j = 0; j < tags.length; j++) {
        row.appendChild(tags[j]);
      }

      card.__rtgTagsGrouped = true;
    }
  }
  enhanceProductCards();
  new MutationObserver(function () {
    enhanceProductCards();
    groupCardTags();
    notifyHeight();
  }).observe(document.body, {
    childList: true, subtree: true
  });
  groupCardTags();

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
    border: 2px solid ${border};
    border-radius: ${radius};
    display: flex;
    flex-direction: column;
    min-height: 560px;
    padding: 0;
    margin: 4px 0;
    background: ${surface};
    box-shadow: inset 0 0 0 1px ${border};
    overflow: hidden;
  }
  .card-title {
    font-weight: 700;
    font-size: 19px;
    line-height: 1.3;
    padding: 18px 20px 0;
    margin-bottom: 0;
    color: ${text};
    display: -webkit-box;
    min-height: calc(1.3em * 2);
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .card-media {
    cursor: pointer;
    margin: 0;
    border-radius: ${radius} ${radius} 0 0;
    overflow: hidden;
    background: linear-gradient(180deg, ${surface} 0%, ${surfaceAlt} 100%);
    border-bottom: 1px solid ${border};
  }
  .card-media:focus-visible { outline: 2px solid ${focus}; outline-offset: 2px; }
  .card-image {
    width: 100%;
    height: 240px;
    object-fit: contain;
    display: block;
    vertical-align: middle;
    padding: 16px;
  }
  .card-price {
    font-weight: 500;
    color: ${text};
    font-size: 16px;
    margin-top: auto;
    padding: 0 20px 18px;
  }
  .card-tag {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    max-width: calc(100% - 40px);
    padding: 5px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    margin: 0;
  }
  .card-tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 20px 0;
  }
  .tag-premium { background: #f4eadb; color: #9a6a1f; }
  .tag-value { background: #ebf5ec; color: #2e7d32; }
  .tag-cooling { background: #e7f1f9; color: #1f5e90; }
  .card-similar-btn {
    position: absolute;
    right: 16px;
    bottom: 16px;
    width: 42px;
    height: 42px;
    border-radius: 999px;
    border: 1px solid ${border};
    background: rgba(255, 255, 255, 0.96);
    color: ${text};
    font-size: 24px;
    line-height: 1;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .card-similar-btn:hover {
    background: ${surface};
    transform: scale(1.03);
  }
  .card > p {
    padding: 8px 20px 0;
    color: ${textMuted};
    font-size: 14px !important;
    line-height: 1.45;
    display: -webkit-box;
    min-height: calc(1.45em * 3);
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }
  .card > div[style*="display:flex"] {
    display: flex !important;
    flex-direction: column;
    gap: 0 !important;
    margin: 0 !important;
    overflow: hidden;
    background: ${surface};
    border-top: 1px solid ${border};
    border-radius: 0 0 calc(${radius} - 2px) calc(${radius} - 2px);
  }
  .card > div[style*="display:flex"] > button {
    width: 100%;
    border: 0;
    border-top: 1px solid ${border};
    border-radius: 0;
    background: ${surface};
    color: ${text};
    margin: 0;
    padding: 18px 20px;
    font-size: 15px;
    font-weight: 700;
    justify-content: center;
    text-align: center;
    box-shadow: none;
  }
  .card > div[style*="display:flex"] > button:first-child {
    border-top: 0;
  }
  .card > div[style*="display:flex"] > button:last-child {
    border-radius: 0 0 calc(${radius} - 2px) calc(${radius} - 2px);
  }
  .card > div[style*="display:flex"] > button:hover {
    background: ${surfaceAlt};
    color: ${text};
  }

  button { font-family: inherit; }
  .btn-primary {
    background: ${accent}; color: ${accentText}; border: none;
    padding: 8px 16px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; transition: background 0.15s;
  }
  .btn-primary:hover { background: ${accentHover}; }
  .btn-secondary {
    background: ${surface}; color: ${text}; border: none;
    padding: 8px 16px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; transition: all 0.15s;
  }
  .btn-secondary:hover { background: ${surfaceAlt}; }
  .btn-cart {
    background: ${success}; color: ${accentText}; border: none;
    padding: 8px 16px; border-radius: 8px; font-weight: 600;
    font-size: 13px; cursor: pointer; transition: filter 0.15s;
  }
  .btn-cart:hover { filter: brightness(0.92); }
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
