CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS definitions (
  word TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  summary TEXT NOT NULL,
  part_of_speech TEXT,
  example TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (word, language)
);

CREATE TABLE IF NOT EXISTS user_words (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word, language)
);

CREATE INDEX IF NOT EXISTS idx_user_words_user ON user_words(user_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS usage_monthly (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  lookups INTEGER NOT NULL DEFAULT 0,
  openai_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year_month)
);
