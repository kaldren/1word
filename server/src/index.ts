import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { authRoutes } from "./routes/auth";
import { defineRoutes } from "./routes/define";
import { wordsRoutes } from "./routes/words";
import { usageRoutes } from "./routes/usage";
import { stripeRoutes } from "./routes/stripe";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());

app.use("*", (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
  return cors({
    origin: (origin) => {
      if (!origin) return origin;
      for (const pattern of allowed) {
        if (pattern === origin) return origin;
        if (pattern.endsWith("*") && origin.startsWith(pattern.slice(0, -1))) return origin;
      }
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
    maxAge: 600,
  })(c, next);
});

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/define", defineRoutes);
app.route("/words", wordsRoutes);
app.route("/usage", usageRoutes);
app.route("/stripe", stripeRoutes);

app.onError((err, c) => {
  console.error("unhandled", err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});

export default app;
