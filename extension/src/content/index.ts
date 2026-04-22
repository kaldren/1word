import type { Msg, MsgResult } from "../lib/messages";
import { STORAGE_KEYS } from "../lib/messages";
import { initSelection } from "./selection";
import {
  removeWord as removeWordFromDom,
  setSavedWords,
  installHoverHandler,
  startObserving,
} from "./underline";
import {
  showTooltip,
  showAllSensesTooltip,
  showLoadingTooltip,
  isTooltipVisible,
} from "./tooltip";
import type { SavedWord, WordSense } from "@vocab/shared";

async function send<T extends MsgResult>(msg: Msg): Promise<T> {
  return (await chrome.runtime.sendMessage(msg)) as T;
}

async function bootstrap(): Promise<void> {
  // ── Underline hover feature ───────────────────────────────────────────────
  // Cache so repeated hovers on the same word are instant.
  const allSensesCache = new Map<string, WordSense[]>();

  const onHover = async (def: WordSense, x: number, y: number) => {
    const cacheKey = `${def.word}|${def.language}`;
    const onRemove = () => {
      removeWordFromDom(def.word);
      send({ type: "removeWord", word: def.word, language: def.language }).catch((err) =>
        console.warn("removeWord_failed", err),
      );
    };

    const cached = allSensesCache.get(cacheKey);
    if (cached) {
      showAllSensesTooltip(cached, x, y, onRemove, def.senseIndex);
      return;
    }

    // Show the saved sense immediately so there's no blank gap, then upgrade.
    showTooltip(def, x, y, onRemove);

    const res = await send({ type: "getSenses", word: def.word, language: def.language });
    if (res.type !== "senses" || res.senses.length === 0) return;

    allSensesCache.set(cacheKey, res.senses);

    // Only replace if the user's tooltip is still open (guard against stale updates).
    if (isTooltipVisible()) {
      showAllSensesTooltip(res.senses, x, y, onRemove, def.senseIndex);
    }
  };

  installHoverHandler(onHover);
  startObserving();

  const applyHighlight = async (enabled: boolean) => {
    if (enabled) {
      const res = await send({ type: "getSavedWords" });
      if (res.type === "savedWords") setSavedWords(res.words);
    } else {
      setSavedWords([]);
    }
  };

  const stored = await chrome.storage.local.get(STORAGE_KEYS.highlightEnabled);
  let highlightOn = (stored[STORAGE_KEYS.highlightEnabled] as boolean | undefined) ?? false;
  await applyHighlight(highlightOn);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (STORAGE_KEYS.highlightEnabled in changes) {
      highlightOn = (changes[STORAGE_KEYS.highlightEnabled]!.newValue as boolean | undefined) ?? false;
      void applyHighlight(highlightOn);
    }

    if (highlightOn && STORAGE_KEYS.savedWords in changes) {
      const next = (changes[STORAGE_KEYS.savedWords]!.newValue as SavedWord[] | undefined) ?? [];
      setSavedWords(next);
    }
  });

  // ── Selection → define flow ───────────────────────────────────────────────
  initSelection(async (word, context, url) => {
    const sel = document.getSelection();
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      x = r.left;
      y = r.bottom;
    }

    showLoadingTooltip(x, y);

    const res = await send({ type: "define", word, context, url });
    if (res.type !== "defineResult") return;

    if (res.ok) {
      const wordToRemove = res.sense ?? res.allSenses[0];
      const onRemove = wordToRemove
        ? () => {
            send({ type: "removeWord", word: wordToRemove.word, language: wordToRemove.language }).catch(
              (err) => console.warn("removeWord_failed", err),
            );
          }
        : undefined;
      showAllSensesTooltip(res.allSenses, x, y, onRemove, res.sense?.senseIndex ?? null);
      return;
    }

    const errorMessages: Record<string, string> = {
      quota_exceeded: "Monthly limit reached. Open the extension popup to upgrade.",
      not_a_word: "That doesn't look like a word or phrase we can define.",
      unauthorized: "Sign in from the extension popup to start defining words.",
      invalid_input: "Only words or short phrases (up to 3 words) are supported.",
      network_error: "Couldn't reach the server.",
      upstream_error: "The definition service is temporarily unavailable.",
    };
    const msg = errorMessages[res.reason] ?? "Something went wrong.";
    showTooltip(
      {
        word: "Heads up",
        language: "en",
        senseIndex: 0,
        keywords: [],
        summary: msg,
        partOfSpeech: null,
        example: null,
      } satisfies WordSense,
      window.innerWidth / 2 - 140,
      80,
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void bootstrap();
  });
} else {
  void bootstrap();
}
