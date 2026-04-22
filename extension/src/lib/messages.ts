import type {
  SavedWord,
  UsageStatus,
  Tier,
  WordSense,
} from "@vocab/shared";

export type Msg =
  | { type: "define"; word: string; language?: string; context?: string; url?: string; forceRefresh?: boolean }
  | { type: "getSenses"; word: string; language?: string }
  | { type: "getSavedWords" }
  | { type: "refreshSavedWords" }
  | { type: "removeWord"; word: string; language?: string }
  | { type: "clearWords" }
  | { type: "getProfile" }
  | { type: "refreshProfile" }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "openCheckout" }
  | { type: "openPortal" };

export type MsgResult =
  | {
      type: "defineResult";
      ok: true;
      sense: WordSense | null;
      allSenses: WordSense[];
      usage: UsageStatus;
    }
  | {
      type: "defineResult";
      ok: false;
      reason: "quota_exceeded" | "not_a_word" | "invalid_input" | "unauthorized" | "network_error" | "upstream_error";
      usage?: UsageStatus;
    }
  | { type: "senses"; senses: WordSense[] }
  | { type: "savedWords"; words: SavedWord[] }
  | { type: "removeResult"; ok: boolean; error?: string }
  | { type: "profile"; signedIn: boolean; email?: string; tier?: Tier; usage?: UsageStatus }
  | { type: "signInResult"; ok: boolean; error?: string }
  | { type: "openResult"; ok: boolean; url?: string; error?: string }
  | { type: "ok" };

export const STORAGE_KEYS = {
  sessionToken: "sessionToken",
  savedWords: "savedWords",
  profile: "profile",
  usage: "usage",
  highlightEnabled: "highlightEnabled",
} as const;
