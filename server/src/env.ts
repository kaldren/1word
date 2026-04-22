export interface Env {
  DB: D1Database;

  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;

  OPENAI_API_KEY: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID_PRO: string;
  PUBLIC_BASE_URL: string;
}
