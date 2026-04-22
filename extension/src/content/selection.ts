const BTN_ID = 'vocab-define-btn';
const WORD_RE = /^[A-Za-z][A-Za-z'-]*(?:\s[A-Za-z][A-Za-z'-]*){0,2}$/;

let btn: HTMLButtonElement | null = null;
let currentWord = '';
let currentContext = '';
let currentUrl = '';

const BLOCK_TAGS = new Set([
  'P', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'ARTICLE', 'SECTION',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV',
]);

function extractContext(range: Range): string {
  // Walk up to nearest block-level ancestor for a full paragraph of text
  let node: Node | null = range.startContainer;
  while (node && node.nodeName !== 'BODY') {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.nodeName)) break;
    node = node.parentNode;
  }
  const blockText = (
    (node && node.nodeName !== 'BODY' ? (node as Element).textContent : null)
    ?? range.startContainer.textContent
    ?? ''
  ).trim();
  if (!blockText) return '';

  const word = range.toString().trim();
  const pos = blockText.toLowerCase().indexOf(word.toLowerCase());
  const anchor = pos >= 0 ? pos : 0;

  // Always scan 200 chars rightward; up to 100 chars leftward
  const beforeStart = Math.max(0, anchor - 100);
  const afterEnd = Math.min(blockText.length, anchor + word.length + 200);
  return blockText.slice(beforeStart, afterEnd).trim().slice(0, 300);
}

function ensureBtn(onDefine: (word: string, context: string, url: string) => void): HTMLButtonElement {
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.textContent = '1word';
  btn.style.cssText = [
    'all: initial',
    'position: fixed',
    "font: 500 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    'padding: 6px 10px',
    'background: #22c55e',
    'color: #ffffff',
    'border-radius: 6px',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.2)',
    'cursor: pointer',
    'z-index: 2147483647',
    'user-select: none',
    'display: none',
  ].join(';');
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentWord) onDefine(currentWord, currentContext, currentUrl);
    hideBtn();
  });
  (document.documentElement || document.body).appendChild(btn);
  return btn;
}

function showBtn(x: number, y: number): void {
  if (!btn) return;
  btn.style.left = `${x}px`;
  btn.style.top = `${y}px`;
  btn.style.display = 'block';
}

function hideBtn(): void {
  if (btn) btn.style.display = 'none';
  currentWord = '';
  currentContext = '';
  currentUrl = '';
}

export function initSelection(onDefine: (word: string, context: string, url: string) => void): void {
  ensureBtn(onDefine);

  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideBtn();
      return;
    }
    const text = sel.toString().trim();
    if (!WORD_RE.test(text)) {
      hideBtn();
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideBtn();
      return;
    }
    currentWord = text;
    currentContext = extractContext(range);
    currentUrl = window.location.href.split('#')[0] ?? window.location.href;
    const top = Math.max(8, rect.top - 32);
    const left = Math.min(window.innerWidth - 80, rect.right + 4);
    showBtn(left, top);
  });

  document.addEventListener(
    'mousedown',
    (e) => {
      if (btn && e.target !== btn) hideBtn();
    },
    true,
  );

  document.addEventListener('scroll', hideBtn, true);
}
