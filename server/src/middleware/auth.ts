import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { verifySessionJwt } from "../services/jwt";
import { getUserById, type UserRow } from "../db/queries";

export interface AuthVars {
  user: UserRow;
}

export const requireUser: MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVars;
}> = async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  const token = header.slice("Bearer ".length);
  let claims;
  try {
    claims = await verifySessionJwt(token, c.env.JWT_SECRET);
  } catch {
    return c.json({ ok: false, error: "invalid_token" }, 401);
  }
  const user = await getUserById(c.env.DB, claims.sub);
  if (!user) {
    return c.json({ ok: false, error: "user_not_found" }, 401);
  }
  c.set("user", user);
  await next();
};
