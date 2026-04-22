export type Tier = 'free' | 'pro';

export const TIER_LIMITS: Record<Tier, number> = {
  free: 10,
  pro: 1000,
};

export interface Definition {
  word: string;
  language: string;
  summary: string;
  partOfSpeech: string | null;
  example: string | null;
}

export interface WordSense extends Definition {
  senseIndex: number;
  keywords: string[];
}

export interface SavedWord {
  word: string;
  language: string;
  savedAt: number;
  senseIndex: number;
  definition: WordSense;
}

export interface UsageStatus {
  tier: Tier;
  yearMonth: string;
  used: number;
  limit: number;
}

export interface DefineRequest {
  word: string;
  language?: string;
  context?: string;
  url?: string;
  forceRefresh?: boolean;
}

export type DefineResponse =
  | {
      ok: true;
      sense: WordSense | null;
      allSenses: WordSense[];
      usage: UsageStatus;
    }
  | { ok: false; reason: 'quota_exceeded'; usage: UsageStatus }
  | { ok: false; reason: 'not_a_word' }
  | { ok: false; reason: 'invalid_input' };

export interface AuthGoogleRequest {
  idToken: string;
}

export interface AuthGoogleResponse {
  token: string;
  email: string;
  tier: Tier;
}

export interface WordsResponse {
  words: SavedWord[];
}

export interface SensesResponse {
  senses: WordSense[];
}

export interface StripeCheckoutResponse {
  url: string;
}

export interface StripePortalResponse {
  url: string;
}

export interface ApiError {
  ok: false;
  error: string;
}
