import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { verifyGoogleIdToken, issueSessionJwt } from "../services/jwt";
import { upsertUserByGoogleSub } from "../db/queries";
import type { AuthGoogleResponse } from "@vocab/shared";

export const authRoutes = new Hono<{ Bindings: Env }>();

const googleSchema = z.object({ idToken: z.string().min(10).max(3000), nonce: z.string().min(1).max(256) });

authRoutes.post("/google", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = googleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: "invalid_input" }, 400);
  }

  let claims;
  try {
    claims = await verifyGoogleIdToken(parsed.data.idToken, c.env.GOOGLE_CLIENT_ID, parsed.data.nonce);
  } catch (err) {
    console.warn("google_verify_failed", err);
    return c.json({ ok: false, error: "invalid_google_token" }, 401);
  }

  const user = await upsertUserByGoogleSub(c.env.DB, claims.sub, claims.email);
  const token = await issueSessionJwt(user.id, c.env.JWT_SECRET);

  const res: AuthGoogleResponse = {
    token,
    email: user.email,
    tier: user.tier,
  };
  return c.json(res);
});
