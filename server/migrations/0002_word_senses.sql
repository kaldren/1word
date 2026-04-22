CREATE TABLE word_senses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  word            TEXT    NOT NULL,
  language        TEXT    NOT NULL DEFAULT 'en',
  sense_index     INTEGER NOT NULL,
  summary         TEXT    NOT NULL,
  part_of_speech  TEXT,
  example         TEXT,
  keywords        TEXT    NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  UNIQUE (word, language, sense_index)
);

CREATE INDEX IF NOT EXISTS idx_word_senses_word ON word_senses(word, language);

CREATE TABLE url_word_sense (
  url_hash    TEXT    NOT NULL,
  word        TEXT    NOT NULL,
  language    TEXT    NOT NULL DEFAULT 'en',
  sense_index INTEGER NOT NULL,
  cached_at   INTEGER NOT NULL,
  PRIMARY KEY (url_hash, word, language)
);

ALTER TABLE user_words ADD COLUMN sense_index INTEGER NOT NULL DEFAULT 0;
