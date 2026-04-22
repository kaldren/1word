import type { WordSense } from "@vocab/shared";

const HOST_ID = "vocab-tooltip-host";
let host: HTMLDivElement | null = null;
let card: HTMLDivElement | null = null;

function makeDraggable(el: HTMLDivElement): void {
  let startMouseX = 0;
  let startMouseY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onMove = (e: MouseEvent) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(0, Math.min(vw - el.offsetWidth,  startLeft + (e.clientX - startMouseX)));
    const top  = Math.max(0, Math.min(vh - el.offsetHeight, startTop  + (e.clientY - startMouseY)));
    el.style.left = `${left}px`;
    el.style.top  = `${top}px`;
  };

  const onUp = () => {
    el.classList.remove("dragging");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };

  el.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest(".drag-handle")) return;
    e.preventDefault();
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startLeft = parseFloat(el.style.left) || 0;
    startTop  = parseFloat(el.style.top)  || 0;
    el.classList.add("dragging");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function ensureHost(): HTMLDivElement {
  if (card) return card;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    @keyframes vocab-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes vocab-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .card {
      position: absolute;
      max-width: 320px;
      min-width: 220px;
      pointer-events: none;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #111827;
      color: #f9fafb;
      padding: 10px 12px;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.28);
      opacity: 0;
      transform: translateY(2px);
      transition: opacity 120ms ease, transform 120ms ease;
    }
    .card.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .card.dragging { user-select: none; }
    .drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 14px;
      margin: -4px -4px 6px;
      border-radius: 6px 6px 0 0;
      cursor: grab;
    }
    .drag-handle::before {
      content: "";
      display: block;
      width: 32px;
      height: 3px;
      border-radius: 2px;
      background: #4b5563;
      opacity: 0.4;
      transition: opacity 120ms;
    }
    .drag-handle:hover::before { opacity: 0.75; }
    .card.dragging .drag-handle,
    .card.dragging .drag-handle::before { cursor: grabbing; }
    .word-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; padding-right: 44px; }
    .word { font-weight: 600; font-size: 14px; }
    .pos { font-style: italic; color: #9ca3af; font-size: 11px; }
    .summary { }
    .example { margin-top: 6px; color: #cbd5e1; font-style: italic; }
    .actions {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      gap: 2px;
    }
    .action-btn {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: #9ca3af;
      border: none;
      border-radius: 4px;
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      padding: 0;
    }
    .action-btn:hover { background: #374151; color: #fff; }
    .action-btn:focus { outline: none; background: #374151; color: #fff; }
    .sense-list { list-style: none; margin: 0; padding: 0; }
    .sense-item {
      padding: 5px 6px;
      border-top: 1px solid #1f2937;
      border-radius: 4px;
      margin: 0 -6px;
    }
    .sense-item:first-child { border-top: none; padding-top: 0; }
    .sense-item.matched { background: #1f2937; }
    .sense-header { display: flex; align-items: baseline; gap: 4px; }
    .sense-num { color: #6b7280; font-size: 11px; }
    .sense-pos { font-style: italic; color: #9ca3af; font-size: 11px; }
    .sense-match-dot { color: #22c55e; font-size: 8px; margin-left: 2px; }
    .sense-example { margin-top: 3px; color: #9ca3af; font-style: italic; font-size: 12px; }
    .loading-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 2px 0;
    }
    .spinner {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      border: 2px solid #374151;
      border-top-color: #22c55e;
      border-radius: 50%;
      animation: vocab-spin 0.65s linear infinite;
    }
    .loading-text {
      color: #9ca3af;
      font-size: 13px;
      animation: vocab-pulse 1.4s ease-in-out infinite;
    }
  `;

  card = document.createElement("div");
  card.className = "card";

  makeDraggable(card);

  // Hide on any click outside the shadow host.
  document.addEventListener("mousedown", (e) => {
    if (!card?.classList.contains("visible")) return;
    if (host?.contains(e.target as Node)) return;
    hideTooltip();
  });

  shadow.appendChild(style);
  shadow.appendChild(card);
  (document.documentElement || document.body).appendChild(host);
  return card;
}

// Clears card content and prepends the drag handle.
function resetCard(): HTMLDivElement {
  const el = ensureHost();
  el.innerHTML = "";
  const handle = document.createElement("div");
  handle.className = "drag-handle";
  el.appendChild(handle);
  return el;
}

function buildActions(onRemove?: () => void): HTMLDivElement {
  const actions = document.createElement("div");
  actions.className = "actions";

  if (onRemove) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-btn danger";
    btn.textContent = "🗑";
    btn.title = "Remove from library";
    btn.setAttribute("aria-label", "Remove word");
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove();
      hideTooltip();
    });
    actions.appendChild(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "action-btn";
  closeBtn.textContent = "×";
  closeBtn.title = "Close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideTooltip();
  });
  actions.appendChild(closeBtn);

  return actions;
}

function positionCard(el: HTMLDivElement, x: number, y: number): void {
  el.style.visibility = "hidden";
  el.style.left = "0px";
  el.style.top = "0px";
  el.classList.add("visible");

  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + 8;
  let top = y + 8;
  if (left + rect.width > vw - 8) left = Math.max(8, x - rect.width - 8);
  if (top + rect.height > vh - 8) top = Math.max(8, y - rect.height - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.visibility = "";
}

export function showLoadingTooltip(x: number, y: number): void {
  const el = resetCard();

  const row = document.createElement("div");
  row.className = "loading-row";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  const text = document.createElement("span");
  text.className = "loading-text";
  text.textContent = "Processing…";
  row.appendChild(spinner);
  row.appendChild(text);
  el.appendChild(row);

  positionCard(el, x, y);
}

export function showTooltip(
  def: WordSense,
  x: number,
  y: number,
  onRemove?: () => void,
): void {
  const el = resetCard();

  const row = document.createElement("div");
  row.className = "word-row";
  const wordEl = document.createElement("div");
  wordEl.className = "word";
  wordEl.textContent = def.word;
  row.appendChild(wordEl);
  if (def.partOfSpeech) {
    const pos = document.createElement("div");
    pos.className = "pos";
    pos.textContent = def.partOfSpeech;
    row.appendChild(pos);
  }
  el.appendChild(row);

  const summary = document.createElement("div");
  summary.className = "summary";
  summary.textContent = def.summary;
  el.appendChild(summary);

  if (def.example) {
    const ex = document.createElement("div");
    ex.className = "example";
    ex.textContent = `"${def.example}"`;
    el.appendChild(ex);
  }

  el.appendChild(buildActions(onRemove));
  positionCard(el, x, y);
}

export function showAllSensesTooltip(
  senses: WordSense[],
  x: number,
  y: number,
  onRemove?: () => void,
  matchedSenseIndex: number | null = null,
): void {
  const first = senses[0];
  if (!first) return;
  if (senses.length === 1) {
    showTooltip(first, x, y, onRemove);
    return;
  }

  const el = resetCard();

  const row = document.createElement("div");
  row.className = "word-row";
  const wordEl = document.createElement("div");
  wordEl.className = "word";
  wordEl.textContent = first.word;
  row.appendChild(wordEl);
  el.appendChild(row);

  const list = document.createElement("ul");
  list.className = "sense-list";

  for (const sense of senses) {
    const isMatched = matchedSenseIndex !== null && sense.senseIndex === matchedSenseIndex;
    const item = document.createElement("li");
    item.className = isMatched ? "sense-item matched" : "sense-item";

    const header = document.createElement("div");
    header.className = "sense-header";

    const num = document.createElement("span");
    num.className = "sense-num";
    num.textContent = `${sense.senseIndex + 1}.`;
    header.appendChild(num);

    header.appendChild(document.createTextNode(sense.summary));

    if (sense.partOfSpeech) {
      const pos = document.createElement("span");
      pos.className = "sense-pos";
      pos.textContent = sense.partOfSpeech;
      header.appendChild(pos);
    }

    if (isMatched) {
      const dot = document.createElement("span");
      dot.className = "sense-match-dot";
      dot.textContent = "●";
      dot.title = "Best match for context";
      header.appendChild(dot);
    }

    item.appendChild(header);

    if (isMatched && sense.example) {
      const ex = document.createElement("div");
      ex.className = "sense-example";
      ex.textContent = `"${sense.example}"`;
      item.appendChild(ex);
    }

    list.appendChild(item);
  }

  el.appendChild(list);
  el.appendChild(buildActions(onRemove));
  positionCard(el, x, y);
}

export function isTooltipVisible(): boolean {
  return card !== null && card.classList.contains("visible");
}

export function hideTooltip(): void {
  if (card) card.classList.remove("visible");
}

