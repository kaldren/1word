import type { SavedWord, Tier, UsageStatus } from "@vocab/shared";
import { STORAGE_KEYS } from "../lib/messages";

export interface Profile {
  email: string;
  tier: Tier;
}

export async function getToken(): Promise<string | null> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.sessionToken);
  return (res[STORAGE_KEYS.sessionToken] as string | null) ?? null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token === null) {
    await chrome.storage.local.remove(STORAGE_KEYS.sessionToken);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.sessionToken]: token });
  }
}

export async function getProfile(): Promise<Profile | null> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.profile);
  return (res[STORAGE_KEYS.profile] as Profile | null) ?? null;
}

export async function setProfile(profile: Profile | null): Promise<void> {
  if (profile === null) {
    await chrome.storage.local.remove(STORAGE_KEYS.profile);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.profile]: profile });
  }
}

export async function getSavedWords(): Promise<SavedWord[]> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.savedWords);
  return (res[STORAGE_KEYS.savedWords] as SavedWord[] | null) ?? [];
}

export async function setSavedWords(words: SavedWord[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.savedWords]: words });
}

export async function addSavedWord(word: SavedWord): Promise<SavedWord[]> {
  const current = await getSavedWords();
  const key = `${word.word}|${word.language}`;
  const without = current.filter((w) => `${w.word}|${w.language}` !== key);
  const next = [word, ...without];
  await setSavedWords(next);
  return next;
}

export async function removeSavedWord(
  word: string,
  language: string,
): Promise<SavedWord[]> {
  const current = await getSavedWords();
  const key = `${word.toLowerCase()}|${language}`;
  const next = current.filter(
    (w) => `${w.word.toLowerCase()}|${w.language}` !== key,
  );
  await setSavedWords(next);
  return next;
}

export async function getUsage(): Promise<UsageStatus | null> {
  const res = await chrome.storage.local.get(STORAGE_KEYS.usage);
  return (res[STORAGE_KEYS.usage] as UsageStatus | null) ?? null;
}

export async function setUsage(usage: UsageStatus | null): Promise<void> {
  if (usage === null) {
    await chrome.storage.local.remove(STORAGE_KEYS.usage);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.usage]: usage });
  }
}

export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.sessionToken,
    STORAGE_KEYS.savedWords,
    STORAGE_KEYS.profile,
    STORAGE_KEYS.usage,
  ]);
}
