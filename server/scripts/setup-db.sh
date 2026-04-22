#!/usr/bin/env bash
# Create (or reuse) the D1 database, patch wrangler.toml with the real ID,
# and run all pending migrations.
#
# Usage:
#   bash server/scripts/setup-db.sh            # local SQLite only
#   bash server/scripts/setup-db.sh --remote   # create on Cloudflare + run migrations remotely
#
# Edit the CONFIG block below, then run once per environment.

set -euo pipefail

# ─────────────────────────────────────────────
# CONFIG  — edit these before running
# ─────────────────────────────────────────────
DB_NAME="1word_db"              # D1 database name in Cloudflare
WORKER_NAME="1word-server"      # Cloudflare Worker name
COMPATIBILITY_DATE="2024-10-01" # Workers compatibility date
MIGRATIONS_DIR="migrations"     # path relative to server/
# ─────────────────────────────────────────────

REMOTE=0
for arg in "$@"; do
  case "$arg" in
    --remote) REMOTE=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

WRANGLER_TOML="wrangler.toml"
NPX="npx --yes wrangler"

echo "=============================="
echo " 1word DB setup"
echo "=============================="
echo "  DB name   : $DB_NAME"
echo "  Worker    : $WORKER_NAME"
echo "  Target    : $([ $REMOTE -eq 1 ] && echo remote && echo local)"
echo

# ── Step 1: resolve database_id ───────────────────────────────────────────────
# We only need a real ID when targeting Cloudflare; local dev uses a SQLite file.
if [[ $REMOTE -eq 1 ]]; then
  echo "── Creating / looking up D1 database on Cloudflare..."

  # Try creating. If it already exists, `wrangler d1 create` exits non-zero with
  # "already exists" in stderr — so we fall back to `d1 info` to get the ID.
  CREATE_OUTPUT=$($NPX d1 create "$DB_NAME" 2>&1) && CREATE_OK=1 || CREATE_OK=0

  if [[ $CREATE_OK -eq 1 ]]; then
    echo "  Database created."
    DB_ID=$(echo "$CREATE_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+')
  else
    if echo "$CREATE_OUTPUT" | grep -qi "already exists"; then
      echo "  Database already exists — fetching ID..."
      INFO_OUTPUT=$($NPX d1 info "$DB_NAME" 2>&1)
      DB_ID=$(echo "$INFO_OUTPUT" | grep -oP '(?i)database[_ ]id[:\s="]+\K[0-9a-f-]{36}' | head -1)
    else
      echo "Error creating database:" >&2
      echo "$CREATE_OUTPUT" >&2
      exit 1
    fi
  fi

  if [[ -z "$DB_ID" ]]; then
    echo "Could not determine database_id. Run:" >&2
    echo "  npx wrangler d1 info $DB_NAME" >&2
    echo "and paste the id into wrangler.toml manually." >&2
    exit 1
  fi

  echo "  database_id: $DB_ID"

  # ── Step 2: patch wrangler.toml ─────────────────────────────────────────────
  echo
  echo "── Patching $WRANGLER_TOML..."

  # Update name, compatibility_date, database_name and database_id.
  # Using perl for reliable in-place editing on both macOS and Linux.
  perl -i -pe "
    s|^name\s*=.*|name = \"$WORKER_NAME\"|;
    s|^compatibility_date\s*=.*|compatibility_date = \"$COMPATIBILITY_DATE\"|;
    s|^database_name\s*=.*|database_name = \"$DB_NAME\"|;
    s|^database_id\s*=.*|database_id = \"$DB_ID\"|;
  " "$WRANGLER_TOML"

  echo "  Done."
fi

# ── Step 3: run migrations ─────────────────────────────────────────────────────
echo
if [[ $REMOTE -eq 1 ]]; then
  echo "── Running migrations on Cloudflare (remote)..."
  $NPX d1 migrations apply "$DB_NAME" --remote
else
  echo "── Running migrations on local SQLite..."
  $NPX d1 migrations apply "$DB_NAME" --local
fi

echo
echo "=============================="
echo " Done."
if [[ $REMOTE -eq 1 ]]; then
  echo
  echo " Next: set secrets with wrangler secret put"
  echo "   OPENAI_API_KEY"
  echo "   JWT_SECRET            (openssl rand -hex 32)"
  echo "   GOOGLE_CLIENT_ID"
  echo "   STRIPE_SECRET_KEY"
  echo "   STRIPE_WEBHOOK_SECRET"
  echo "   STRIPE_PRICE_ID_PRO"
  echo "   PUBLIC_BASE_URL"
  echo
  echo " Then deploy: npx wrangler deploy"
fi
echo "=============================="
