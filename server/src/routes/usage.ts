import { Hono } from "hono";
import type { Env } from "../env";
import { requireUser, type AuthVars } from "../middleware/auth";
import { getUsage } from "../services/quota";

export const usageRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();

usageRoutes.get("/", requireUser, async (c) => {
  const user = c.get("user");
  const usage = await getUsage(c.env.DB, user.id, user.tier);
  return c.json(usage);
});
