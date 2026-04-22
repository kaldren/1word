import { Hono } from "hono";
import type { Env } from "../env";
import { requireUser, type AuthVars } from "../middleware/auth";
import {
  clearUserWords,
  deleteUserWord,
  getWordSenses,
  listUserWords,
  rowToWordSense,
} from "../services/definitions";
import type { SensesResponse, WordsResponse, SavedWord } from "@vocab/shared";

export const wordsRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

const WORD_RE = /^[a-z][a-z'-]*(?:\s[a-z][a-z'-]*){0,2}$/;

wordsRoutes.get("/", requireUser, async (c) => {
  const user = c.get("user");
  const rows = await listUserWords(c.env.DB, user.id);
  const words: SavedWord[] = rows.map((r) => ({
    word: r.word,
    language: r.language,
    savedAt: r.saved_at,
    senseIndex: r.sense_index,
    definition: {
      word: r.word,
      language: r.language,
      senseIndex: r.sense_index,
      summary: r.summary,
      partOfSpeech: r.part_of_speech,
      example: r.example,
      keywords: JSON.parse(r.keywords) as string[],
    },
  }));
  const res: WordsResponse = { words };
  return c.json(res);
});

wordsRoutes.get("/:word/senses", requireUser, async (c) => {
  const raw = decodeURIComponent(c.req.param("word") ?? "").trim().toLowerCase();
  if (!WORD_RE.test(raw)) {
    return c.json({ ok: false, error: "invalid_input" }, 400);
  }
  const language = (c.req.query("language") ?? "en").toLowerCase();
  const rows = await getWordSenses(c.env.DB, raw, language);
  const res: SensesResponse = { senses: rows.map(rowToWordSense) };
  return c.json(res);
});

wordsRoutes.delete("/", requireUser, async (c) => {
  const user = c.get("user");
  await clearUserWords(c.env.DB, user.id);
  return c.json({ ok: true });
});

wordsRoutes.delete("/:word", requireUser, async (c) => {
  const user = c.get("user");
  const raw = decodeURIComponent(c.req.param("word") ?? "").trim().toLowerCase();
  if (!WORD_RE.test(raw)) {
    return c.json({ ok: false, error: "invalid_input" }, 400);
  }
  const language = (c.req.query("language") ?? "en").toLowerCase();
  await deleteUserWord(c.env.DB, user.id, raw, language);
  return c.json({ ok: true });
});
