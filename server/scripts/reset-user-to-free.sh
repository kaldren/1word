#!/usr/bin/env bash
# Downgrade a user to the free tier in the LOCAL D1 database and (optionally)
# reset their current month's lookup counter. Use this to retest the Stripe
# checkout flow end-to-end against your own account.
#
# Usage:
#   bash server/scripts/reset-user-to-free.sh [email] [--reset-usage] [--remote]
#
# Defaults:
#   email         kaloyandrenski@gmail.com
#   --reset-usage also deletes the current usage_monthly row
#   --remote      target the deployed D1 database instead of local

set -euo pipefail

EMAIL="kaloyandrenski@gmail.com"
RESET_USAGE=0
D1_FLAG="--local"

for arg in "$@"; do
  case "$arg" in
    --reset-usage) RESET_USAGE=1 ;;
    --remote)      D1_FLAG="--remote" ;;
    --*)           echo "unknown flag: $arg" >&2; exit 2 ;;
    *)             EMAIL="$arg" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "Target: $D1_FLAG  |  email: $EMAIL"
echo

echo "Before:"
npx wrangler d1 execute vocab_db $D1_FLAG --command \
  "SELECT id, email, tier, stripe_customer_id, stripe_subscription_id FROM users WHERE email = '$EMAIL'"

echo
echo "Downgrading to free (keeping stripe_customer_id so the next checkout reuses the same customer)..."
npx wrangler d1 execute vocab_db $D1_FLAG --command \
  "UPDATE users SET tier='free', stripe_subscription_id=NULL WHERE email='$EMAIL'"

if [[ $RESET_USAGE -eq 1 ]]; then
  echo
  echo "Resetting this month's lookup counter..."
  npx wrangler d1 execute vocab_db $D1_FLAG --command \
    "DELETE FROM usage_monthly WHERE user_id = (SELECT id FROM users WHERE email='$EMAIL')"
fi

echo
echo "After:"
npx wrangler d1 execute vocab_db $D1_FLAG --command \
  "SELECT u.email, u.tier, u.stripe_customer_id, u.stripe_subscription_id, (SELECT lookups FROM usage_monthly WHERE user_id = u.id AND year_month = strftime('%Y-%m','now')) AS lookups_this_month FROM users u WHERE u.email = '$EMAIL'"

cat <<'NOTE'

Done. Reminder: the Stripe subscription (if any) is still ACTIVE in Stripe.
Cancel it so the next billing event doesn't re-upgrade this user:

  stripe subscriptions cancel <sub_id>

or via dashboard: https://dashboard.stripe.com/test/subscriptions
NOTE
