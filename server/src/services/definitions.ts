import type { WordSense } from "@vocab/shared";
import type { AiSense } from "./openai";

export interface WordSenseRow {
  id: number;
  word: string;
  language: string;
  sense_index: number;
  summary: string;
  part_of_speech: string | null;
  example: string | null;
  keywords: string;
}

// ── word_senses ────────────────────────────────────────────────────────────────

export async function getWordSenses(
  db: D1Database,
  word: string,
  language: string,
): Promise<WordSenseRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM word_senses WHERE word = ? AND language = ? ORDER BY sense_index ASC",
    )
    .bind(word, language)
    .all<WordSenseRow>();
  return result.results ?? [];
}

export async function putWordSenses(
  db: D1Database,
  word: string,
  language: string,
  senses: AiSense[],
): Promise<void> {
  const now = Date.now();
  const stmts = senses.map((s, i) =>
    db
      .prepare(
        `INSERT INTO word_senses (word, language, sense_index, summary, part_of_speech, example, keywords, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(word, language, sense_index) DO UPDATE SET
           summary = excluded.summary,
           part_of_speech = excluded.part_of_speech,
           example = excluded.example,
           keywords = excluded.keywords`,
      )
      .bind(
        word,
        language,
        i,
        s.summary,
        s.part_of_speech,
        s.example,
        JSON.stringify(s.keywords),
        now,
      ),
  );
  await db.batch(stmts);
}

export function rowToWordSense(row: WordSenseRow): WordSense {
  return {
    word: row.word,
    language: row.language,
    senseIndex: row.sense_index,
    summary: row.summary,
    partOfSpeech: row.part_of_speech,
    example: row.example,
    keywords: JSON.parse(row.keywords) as string[],
  };
}

// ── url_word_sense ─────────────────────────────────────────────────────────────

export async function getUrlWordSense(
  db: D1Database,
  urlHash: string,
  word: string,
  language: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      "SELECT sense_index FROM url_word_sense WHERE url_hash = ? AND word = ? AND language = ?",
    )
    .bind(urlHash, word, language)
    .first<{ sense_index: number }>();
  return row ? row.sense_index : null;
}

export async function putUrlWordSense(
  db: D1Database,
  urlHash: string,
  word: string,
  language: string,
  senseIndex: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO url_word_sense (url_hash, word, language, sense_index, cached_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url_hash, word, language) DO UPDATE SET
         sense_index = excluded.sense_index,
         cached_at = excluded.cached_at`,
    )
    .bind(urlHash, word, language, senseIndex, Date.now())
    .run();
}

export async function deleteUrlWordSense(
  db: D1Database,
  urlHash: string,
  word: string,
  language: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM url_word_sense WHERE url_hash = ? AND word = ? AND language = ?",
    )
    .bind(urlHash, word, language)
    .run();
}

// ── sense matching (pure, no DB) ───────────────────────────────────────────────

export function matchSense(rows: WordSenseRow[], word: string, context: string): number {
  const wordParts = new Set(word.toLowerCase().split(/\s+/));
  const contextTokens = new Set(
    (context.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []).filter(
      (t) => !wordParts.has(t),
    ),
  );
  let bestIdx = -1;
  let bestScore = 0;
  for (const row of rows) {
    const keywords = JSON.parse(row.keywords) as string[];
    const score = keywords.filter((k) => contextTokens.has(k.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = row.sense_index;
    }
  }
  return bestScore > 0 ? bestIdx : -1;
}

// ── user_words ─────────────────────────────────────────────────────────────────

export async function userWordExists(
  db: D1Database,
  userId: string,
  word: string,
  language: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM user_words WHERE user_id = ? AND word = ? AND language = ?")
    .bind(userId, word, language)
    .first();
  return row !== null;
}

export async function saveUserWord(
  db: D1Database,
  userId: string,
  word: string,
  language: string,
  senseIndex: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_words (user_id, word, language, saved_at, sense_index)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, word, language) DO UPDATE SET
         saved_at = excluded.saved_at,
         sense_index = excluded.sense_index`,
    )
    .bind(userId, word, language, Date.now(), senseIndex)
    .run();
}

export async function clearUserWords(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM user_words WHERE user_id = ?")
    .bind(userId)
    .run();
}

export async function deleteUserWord(
  db: D1Database,
  userId: string,
  word: string,
  language: string,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM user_words WHERE user_id = ? AND word = ? AND language = ?",
    )
    .bind(userId, word, language)
    .run();
}

export interface SavedWordRow {
  word: string;
  language: string;
  saved_at: number;
  sense_index: number;
  summary: string;
  part_of_speech: string | null;
  example: string | null;
  keywords: string;
}

export async function listUserWords(
  db: D1Database,
  userId: string,
): Promise<SavedWordRow[]> {
  const result = await db
    .prepare(
      `SELECT uw.word, uw.language, uw.saved_at, uw.sense_index,
              ws.summary, ws.part_of_speech, ws.example, ws.keywords
         FROM user_words uw
         JOIN word_senses ws
           ON ws.word = uw.word
          AND ws.language = uw.language
          AND ws.sense_index = uw.sense_index
         WHERE uw.user_id = ?
         ORDER BY uw.saved_at DESC`,
    )
    .bind(userId)
    .all<SavedWordRow>();
  return result.results ?? [];
}
