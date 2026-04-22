import { TIER_LIMITS, type Tier, type UsageStatus } from "@vocab/shared";

export function currentYearMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getUsage(
  db: D1Database,
  userId: string,
  tier: Tier,
): Promise<UsageStatus> {
  const ym = currentYearMonth();
  const row = await db
    .prepare(
      "SELECT lookups FROM usage_monthly WHERE user_id = ? AND year_month = ?",
    )
    .bind(userId, ym)
    .first<{ lookups: number }>();
  return {
    tier,
    yearMonth: ym,
    used: row?.lookups ?? 0,
    limit: TIER_LIMITS[tier],
  };
}

export interface QuotaResult {
  allowed: boolean;
  usage: UsageStatus;
}

export async function incrementIfUnderQuota(
  db: D1Database,
  userId: string,
  tier: Tier,
): Promise<QuotaResult> {
  const ym = currentYearMonth();
  const limit = TIER_LIMITS[tier];

  const row = await db
    .prepare(
      `INSERT INTO usage_monthly (user_id, year_month, lookups) VALUES (?, ?, 1)
       ON CONFLICT(user_id, year_month) DO UPDATE SET lookups = lookups + 1
       RETURNING lookups`,
    )
    .bind(userId, ym)
    .first<{ lookups: number }>();

  const used = row?.lookups ?? 1;

  if (used > limit) {
    await db
      .prepare(
        "UPDATE usage_monthly SET lookups = lookups - 1 WHERE user_id = ? AND year_month = ?",
      )
      .bind(userId, ym)
      .run();
    return {
      allowed: false,
      usage: { tier, yearMonth: ym, used: used - 1, limit },
    };
  }

  return {
    allowed: true,
    usage: { tier, yearMonth: ym, used, limit },
  };
}

export async function markOpenAiCall(
  db: D1Database,
  userId: string,
): Promise<void> {
  const ym = currentYearMonth();
  await db
    .prepare(
      `INSERT INTO usage_monthly (user_id, year_month, lookups, openai_calls) VALUES (?, ?, 0, 1)
       ON CONFLICT(user_id, year_month) DO UPDATE SET openai_calls = openai_calls + 1`,
    )
    .bind(userId, ym)
    .run();
}

export async function refundLookup(
  db: D1Database,
  userId: string,
): Promise<void> {
  const ym = currentYearMonth();
  await db
    .prepare(
      "UPDATE usage_monthly SET lookups = lookups - 1 WHERE user_id = ? AND year_month = ? AND lookups > 0",
    )
    .bind(userId, ym)
    .run();
}
