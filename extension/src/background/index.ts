import type { Msg, MsgResult } from "../lib/messages";
import {
  addSavedWord,
  clearAll,
  getProfile,
  getSavedWords,
  getUsage,
  removeSavedWord,
  setProfile,
  setSavedWords,
  setUsage,
} from "./storage";
import {
  clearWords,
  createCheckout,
  createPortal,
  define,
  fetchSenses,
  fetchUsage,
  fetchWords,
  removeWord,
  ApiError,
} from "./api";
import { signInWithGoogle } from "./signIn";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[vocab] background installed");
});

async function handle(msg: Msg): Promise<MsgResult> {
  switch (msg.type) {
    case "define": {
      try {
        const res = await define({
          word: msg.word,
          language: msg.language,
          context: msg.context,
          url: msg.url,
          forceRefresh: msg.forceRefresh,
        });
        if (res.ok) {
          const matchedSense = res.sense ?? res.allSenses[0];
          if (matchedSense) {
            await addSavedWord({
              word: matchedSense.word,
              language: matchedSense.language,
              savedAt: Date.now(),
              senseIndex: matchedSense.senseIndex,
              definition: matchedSense,
            });
          }
          await setUsage(res.usage);
          return {
            type: "defineResult",
            ok: true,
            sense: res.sense,
            allSenses: res.allSenses,
            usage: res.usage,
          };
        }
        if (res.reason === "quota_exceeded") {
          if (res.usage) await setUsage(res.usage);
          return { type: "defineResult", ok: false, reason: "quota_exceeded", usage: res.usage };
        }
        return { type: "defineResult", ok: false, reason: res.reason };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return { type: "defineResult", ok: false, reason: "unauthorized" };
        }
        console.error("define_error", err);
        return { type: "defineResult", ok: false, reason: "network_error" };
      }
    }

    case "getSenses": {
      try {
        const { senses } = await fetchSenses(msg.word, msg.language);
        return { type: "senses", senses };
      } catch (err) {
        console.error("getSenses_error", err);
        return { type: "senses", senses: [] };
      }
    }

    case "getSavedWords": {
      const words = await getSavedWords();
      return { type: "savedWords", words };
    }

    case "refreshSavedWords": {
      try {
        const { words } = await fetchWords();
        await setSavedWords(words);
        return { type: "savedWords", words };
      } catch (err) {
        console.warn("refreshSavedWords_failed", err);
        const words = await getSavedWords();
        return { type: "savedWords", words };
      }
    }

    case "clearWords": {
      try {
        await clearWords();
        await setSavedWords([]);
        return { type: "removeResult", ok: true };
      } catch (err) {
        console.error("clearWords_error", err);
        return {
          type: "removeResult",
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }

    case "removeWord": {
      const language = msg.language ?? "en";
      try {
        await removeWord(msg.word, language);
        await removeSavedWord(msg.word, language);
        return { type: "removeResult", ok: true };
      } catch (err) {
        console.error("removeWord_error", err);
        return {
          type: "removeResult",
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }

    case "getProfile": {
      const profile = await getProfile();
      const usage = await getUsage();
      if (!profile) return { type: "profile", signedIn: false };
      return {
        type: "profile",
        signedIn: true,
        email: profile.email,
        tier: profile.tier,
        usage: usage ?? undefined,
      };
    }

    case "refreshProfile": {
      const profile = await getProfile();
      if (!profile) return { type: "profile", signedIn: false };
      try {
        const usage = await fetchUsage();
        if (usage.tier !== profile.tier) {
          await setProfile({ email: profile.email, tier: usage.tier });
        }
        await setUsage(usage);
        return {
          type: "profile",
          signedIn: true,
          email: profile.email,
          tier: usage.tier,
          usage,
        };
      } catch (err) {
        console.warn("refreshProfile_failed", err);
        const usage = await getUsage();
        return {
          type: "profile",
          signedIn: true,
          email: profile.email,
          tier: profile.tier,
          usage: usage ?? undefined,
        };
      }
    }

    case "signIn": {
      try {
        await signInWithGoogle();
        try {
          const [{ words }, usage] = await Promise.all([
            fetchWords(),
            fetchUsage(),
          ]);
          await setSavedWords(words);
          await setUsage(usage);
        } catch (e) {
          console.warn("post_signin_fetch_failed", e);
        }
        return { type: "signInResult", ok: true };
      } catch (err) {
        console.error("signIn_error", err);
        return {
          type: "signInResult",
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }

    case "signOut": {
      await clearAll();
      return { type: "ok" };
    }

    case "openCheckout": {
      try {
        const { url } = await createCheckout();
        await chrome.tabs.create({ url });
        return { type: "openResult", ok: true, url };
      } catch (err) {
        return {
          type: "openResult",
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }

    case "openPortal": {
      try {
        const { url } = await createPortal();
        await chrome.tabs.create({ url });
        return { type: "openResult", ok: true, url };
      } catch (err) {
        return {
          type: "openResult",
          ok: false,
          error: err instanceof Error ? err.message : "unknown_error",
        };
      }
    }
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg)
    .then(sendResponse)
    .catch((err) => {
      console.error("handler_exception", err);
      sendResponse({ type: "ok" } satisfies MsgResult);
    });
  return true;
});
