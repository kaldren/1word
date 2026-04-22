import type { SavedWord, WordSense } from "@vocab/shared";

const UNDERLINE_CLASS = "vocab-underline";
const STYLE_ID = "vocab-underline-styles";
const MARK_ATTR = "data-vocab-scanned";
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "INPUT", "TEXTAREA",
  "CODE", "PRE", "KBD", "SAMP",
]);

let wordSet: Set<string> = new Set();
const defMap = new Map<string, WordSense>();
let compiledPattern: RegExp | null = null;
let observer: MutationObserver | null = null;
let hoverInstalled = false;

// Rebuild the match regex whenever wordSet changes.
// Phrases are sorted longest-first so "azure function" beats "azure".
function buildPattern(): void {
  if (wordSet.size === 0) { compiledPattern = null; return; }
  const escaped = [...wordSet]
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  compiledPattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${UNDERLINE_CLASS} {
      text-decoration: underline;
      text-decoration-style: dotted;
      text-decoration-color: #22c55e;
      text-decoration-thickness: 2px;
      text-underline-offset: 2px;
      cursor: help;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function shouldSkipElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.classList.contains(UNDERLINE_CLASS)) return true;
  return false;
}

function isInsideSkipped(node: Node): boolean {
  let cur: Node | null = node.parentNode;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    if (shouldSkipElement(cur as Element)) return true;
    cur = cur.parentNode;
  }
  return false;
}

function underlineTextNode(textNode: Text): void {
  if (!compiledPattern) return;
  const text = textNode.nodeValue;
  if (!text) return;

  const matches = [...text.matchAll(compiledPattern)];
  if (matches.length === 0) return;

  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of matches) {
    const start = m.index!;
    if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
    const matched = m[1]!;
    const span = document.createElement("span");
    span.className = UNDERLINE_CLASS;
    span.setAttribute("data-word", matched.toLowerCase());
    span.textContent = matched;
    frag.appendChild(span);
    last = start + matched.length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

  textNode.parentNode?.replaceChild(frag, textNode);
}

function scanRoot(root: Node): void {
  if (!compiledPattern) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!isInsideSkipped(root)) underlineTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (shouldSkipElement(el)) return;
  if (el.hasAttribute(MARK_ATTR)) return;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isInsideSkipped(node)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const t of nodes) underlineTextNode(t);
  el.setAttribute(MARK_ATTR, "1");
}

function stripUnderlinesFor(key: string): void {
  document.querySelectorAll<HTMLElement>(
    `span.${UNDERLINE_CLASS}[data-word="${CSS.escape(key)}"]`,
  ).forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent ?? ""), span);
    parent.normalize();
  });
}

export function setSavedWords(words: SavedWord[]): void {
  injectStyles();
  const nextSet = new Set<string>();
  const nextDefs = new Map<string, WordSense>();
  for (const w of words) {
    const key = w.word.toLowerCase();
    nextSet.add(key);
    nextDefs.set(key, w.definition);
  }

  defMap.clear();
  for (const [k, v] of nextDefs) defMap.set(k, v);

  const removed = [...wordSet].filter((k) => !nextSet.has(k));
  removed.forEach(stripUnderlinesFor);

  wordSet = nextSet;
  buildPattern();

  document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.removeAttribute(MARK_ATTR));
  if (document.body) scanRoot(document.body);
}

export function addWord(word: SavedWord): void {
  injectStyles();
  const key = word.word.toLowerCase();
  wordSet.add(key);
  defMap.set(key, word.definition);
  buildPattern();
  document.querySelectorAll(`[${MARK_ATTR}]`).forEach((el) => el.removeAttribute(MARK_ATTR));
  if (document.body) scanRoot(document.body);
}

export function removeWord(word: string): void {
  const key = word.toLowerCase();
  wordSet.delete(key);
  defMap.delete(key);
  buildPattern();
  stripUnderlinesFor(key);
}

const pendingRoots: Set<Node> = new Set();
let flushScheduled = false;

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = () => {
    flushScheduled = false;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    for (const r of roots) {
      if (r.isConnected) scanRoot(r);
    }
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 250 });
  } else {
    requestAnimationFrame(run);
  }
}

export function startObserving(): void {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType !== Node.ELEMENT_NODE && added.nodeType !== Node.TEXT_NODE) continue;
        if (
          added.nodeType === Node.ELEMENT_NODE &&
          (added as Element).classList?.contains(UNDERLINE_CLASS)
        ) continue;
        pendingRoots.add(added);
      }
    }
    if (pendingRoots.size > 0) scheduleFlush();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function installHoverHandler(
  onHover: (def: WordSense, x: number, y: number) => void,
): void {
  if (hoverInstalled) return;
  hoverInstalled = true;

  document.addEventListener("mouseover", (e) => {
    const target = e.target as Element | null;
    if (!target || !(target instanceof Element)) return;
    if (!target.classList.contains(UNDERLINE_CLASS)) return;
    const word = target.getAttribute("data-word");
    if (!word) return;
    const def = defMap.get(word);
    if (!def) return;
    const r = target.getBoundingClientRect();
    onHover(def, r.left, r.bottom);
  });

}
