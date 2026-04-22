import type { Tier } from "@vocab/shared";

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  tier: Tier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: number;
}

export async function upsertUserByGoogleSub(
  db: D1Database,
  googleSub: string,
  email: string,
): Promise<UserRow> {
  const existing = await db
    .prepare("SELECT * FROM users WHERE google_sub = ?")
    .bind(googleSub)
    .first<UserRow>();

  if (existing) {
    if (existing.email !== email) {
      await db
        .prepare("UPDATE users SET email = ? WHERE id = ?")
        .bind(email, existing.id)
        .run();
      existing.email = email;
    }
    return existing;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO users (id, google_sub, email, tier, created_at) VALUES (?, ?, ?, 'free', ?)",
    )
    .bind(id, googleSub, email, now)
    .run();

  return {
    id,
    google_sub: googleSub,
    email,
    tier: "free",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    created_at: now,
  };
}

export async function getUserById(
  db: D1Database,
  id: string,
): Promise<UserRow | null> {
  return await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
}

export async function getUserByStripeCustomerId(
  db: D1Database,
  customerId: string,
): Promise<UserRow | null> {
  return await db
    .prepare("SELECT * FROM users WHERE stripe_customer_id = ?")
    .bind(customerId)
    .first<UserRow>();
}

export async function setUserStripeCustomer(
  db: D1Database,
  userId: string,
  customerId: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?")
    .bind(customerId, userId)
    .run();
}

export async function setUserSubscription(
  db: D1Database,
  userId: string,
  subscriptionId: string,
  tier: Tier,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET stripe_subscription_id = ?, tier = ? WHERE id = ?",
    )
    .bind(subscriptionId, tier, userId)
    .run();
}

export async function downgradeUser(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET tier = 'free', stripe_subscription_id = NULL WHERE id = ?",
    )
    .bind(userId)
    .run();
}
