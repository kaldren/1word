import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { requireUser, type AuthVars } from "../middleware/auth";
import {
  deleteUrlWordSense,
  getUrlWordSense,
  getWordSenses,
  matchSense,
  putUrlWordSense,
  putWordSenses,
  rowToWordSense,
  saveUserWord,
  userWordExists,
} from "../services/definitions";
import { fetchAllSenses, selectSenseForContext } from "../services/openai";
import {
  getUsage,
  incrementIfUnderQuota,
  markOpenAiCall,
  refundLookup,
} from "../services/quota";
import type { DefineResponse } from "@vocab/shared";

export const defineRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

const WORD_RE = /^[a-z][a-z'-]*(?:\s[a-z][a-z'-]*){0,2}$/;

const schema = z.object({
  word: z.string().min(1).max(60),
  language: z.string().length(2).optional(),
  context: z.string().max(300).optional(),
  url: z.string().max(2048).optional(),
  forceRefresh: z.boolean().optional(),
});

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "_ga", "_gl",
]);

async function hashUrl(url: string): Promise<string> {
  const normalized = (() => {
    try {
      const u = new URL(url);
      for (const key of [...u.searchParams.keys()]) {
        if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key);
      }
      const qs = u.searchParams.toString();
      return u.origin + u.pathname + (qs ? "?" + qs : "");
    } catch {
      return url;
    }
  })();
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

defineRoutes.post("/", requireUser, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const res: DefineResponse = { ok: false, reason: "invalid_input" };
    return c.json(res, 400);
  }

  const word = parsed.data.word.trim().toLowerCase();
  const language = parsed.data.language ?? "en";
  const context = parsed.data.context?.trim() ?? "";
  const rawUrl = parsed.data.url ?? "";
  const forceRefresh = parsed.data.forceRefresh ?? false;

  if (!WORD_RE.test(word)) {
    const res: DefineResponse = { ok: false, reason: "invalid_input" };
    return c.json(res, 400);
  }

  const user = c.get("user");

  // Words the user has already looked up don't consume quota again.
  const isRepeat = await userWordExists(c.env.DB, user.id, word, language);

  let currentUsage;
  if (isRepeat) {
    currentUsage = await getUsage(c.env.DB, user.id, user.tier);
  } else {
    const quota = await incrementIfUnderQuota(c.env.DB, user.id, user.tier);
    if (!quota.allowed) {
      const res: DefineResponse = {
        ok: false,
        reason: "quota_exceeded",
        usage: quota.usage,
      };
      return c.json(res, 402);
    }
    currentUsage = quota.usage;
  }

  // ── 1. URL cache lookup ────────────────────────────────────────────────────
  const urlHash = rawUrl ? await hashUrl(rawUrl) : "";

  if (urlHash && !forceRefresh) {
    const cachedSenseIndex = await getUrlWordSense(c.env.DB, urlHash, word, language);
    if (cachedSenseIndex !== null) {
      const rows = await getWordSenses(c.env.DB, word, language);
      const row = rows.find((r) => r.sense_index === cachedSenseIndex) ?? rows[0];
      if (row) {
        await saveUserWord(c.env.DB, user.id, word, language, row.sense_index);
        const allSenses = rows.map(rowToWordSense);
        const res: DefineResponse = {
          ok: true,
          sense: rowToWordSense(row),
          allSenses,
          usage: currentUsage,
        };
        return c.json(res);
      }
    }
  }

  // ── 2. Load or generate senses ─────────────────────────────────────────────
  let rows = await getWordSenses(c.env.DB, word, language);

  let freshBestSenseIndex: number | null = null;

  if (rows.length === 0) {
    let result;
    try {
      result = await fetchAllSenses(c.env.OPENAI_API_KEY, word, context || undefined);
    } catch (err) {
      console.error("openai_error", err);
      if (!isRepeat) await refundLookup(c.env.DB, user.id);
      return c.json({ ok: false, error: "upstream_error" }, 502);
    }
    await markOpenAiCall(c.env.DB, user.id);

    if (result.senses.length === 0) {
      if (!isRepeat) await refundLookup(c.env.DB, user.id);
      const res: DefineResponse = { ok: false, reason: "not_a_word" };
      return c.json(res, 422);
    }

    await putWordSenses(c.env.DB, word, language, result.senses);
    rows = await getWordSenses(c.env.DB, word, language);
    freshBestSenseIndex = result.bestSenseIndex;
  }

  // ── 3. Select sense ────────────────────────────────────────────────────────
  let selectedIndex: number | null = null;

  if (context) {
    const matched = matchSense(rows, word, context);
    if (matched >= 0) {
      selectedIndex = matched;
    } else if (freshBestSenseIndex !== null) {
      // AI already told us the best sense during generation
      selectedIndex = rows[freshBestSenseIndex]?.sense_index ?? null;
    } else if (rows.length > 1) {
      // Keyword matching failed for an existing word — ask AI to pick
      try {
        const arrayPos = await selectSenseForContext(
          c.env.OPENAI_API_KEY,
          word,
          context,
          rows.map((r) => ({ summary: r.summary })),
        );
        selectedIndex = rows[arrayPos]?.sense_index ?? null;
        await markOpenAiCall(c.env.DB, user.id);
      } catch (err) {
        console.error("select_sense_error", err);
      }
    } else {
      selectedIndex = rows[0]?.sense_index ?? null;
    }
  } else if (rows.length === 1) {
    selectedIndex = rows[0]!.sense_index;
  }

  // ── 4. Update URL cache ────────────────────────────────────────────────────
  if (urlHash) {
    if (forceRefresh) {
      await deleteUrlWordSense(c.env.DB, urlHash, word, language);
    }
    if (selectedIndex !== null) {
      await putUrlWordSense(c.env.DB, urlHash, word, language, selectedIndex);
    }
  }

  // ── 5. Save to user library ────────────────────────────────────────────────
  const senseIndexToSave = selectedIndex ?? 0;
  await saveUserWord(c.env.DB, user.id, word, language, senseIndexToSave);

  const allSenses = rows.map(rowToWordSense);
  const sense =
    selectedIndex !== null
      ? (allSenses.find((s) => s.senseIndex === selectedIndex) ?? null)
      : null;

  const res: DefineResponse = { ok: true, sense, allSenses, usage: currentUsage };
  return c.json(res);
});
