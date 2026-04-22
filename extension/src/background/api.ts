import type {
  AuthGoogleResponse,
  DefineRequest,
  DefineResponse,
  SensesResponse,
  StripeCheckoutResponse,
  StripePortalResponse,
  UsageStatus,
  WordsResponse,
} from "@vocab/shared";
import { API_BASE } from "../lib/config";
import { getToken } from "./storage";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new ApiError(401, "unauthorized");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const reason = (body as { error?: string; reason?: string }).error
      ?? (body as { reason?: string }).reason
      ?? "request_failed";
    throw new ApiError(res.status, reason, body);
  }
  return body;
}

export async function exchangeGoogleIdToken(
  idToken: string,
  nonce: string,
): Promise<AuthGoogleResponse> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, nonce }),
  });
  const body = (await res.json()) as AuthGoogleResponse | { ok: false; error: string };
  if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? "auth_failed");
  return body as AuthGoogleResponse;
}

export async function define(req: DefineRequest): Promise<DefineResponse> {
  try {
    return await authed<DefineResponse>("/define", {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 402) {
      const body = err.body as DefineResponse | undefined;
      if (body && body.ok === false && body.reason === "quota_exceeded") {
        return body;
      }
    }
    throw err;
  }
}

export async function fetchSenses(
  word: string,
  language = "en",
): Promise<SensesResponse> {
  const path = `/words/${encodeURIComponent(word.toLowerCase())}/senses?language=${encodeURIComponent(language)}`;
  return authed<SensesResponse>(path);
}

export async function fetchWords(): Promise<WordsResponse> {
  return authed<WordsResponse>("/words");
}

export async function removeWord(
  word: string,
  language = "en",
): Promise<{ ok: true }> {
  const path = `/words/${encodeURIComponent(word.toLowerCase())}?language=${encodeURIComponent(language)}`;
  return authed<{ ok: true }>(path, { method: "DELETE" });
}

export async function clearWords(): Promise<{ ok: true }> {
  return authed<{ ok: true }>("/words", { method: "DELETE" });
}

export async function fetchUsage(): Promise<UsageStatus> {
  return authed<UsageStatus>("/usage");
}

export async function createCheckout(): Promise<StripeCheckoutResponse> {
  return authed<StripeCheckoutResponse>("/stripe/checkout", { method: "POST" });
}

export async function createPortal(): Promise<StripePortalResponse> {
  return authed<StripePortalResponse>("/stripe/portal", { method: "POST" });
}
