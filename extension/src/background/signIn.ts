import { GOOGLE_CLIENT_ID } from "../lib/config";
import { exchangeGoogleIdToken } from "./api";
import { setProfile, setToken } from "./storage";

function randomNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signInWithGoogle(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID not configured; add it to extension/.env.local",
    );
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = randomNonce();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid email");
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });
  if (!responseUrl) throw new Error("auth_flow_cancelled");

  const fragment = new URL(responseUrl).hash.slice(1);
  const params = new URLSearchParams(fragment);
  const idToken = params.get("id_token");
  if (!idToken) throw new Error("id_token_missing");

  const { token, email, tier } = await exchangeGoogleIdToken(idToken, nonce);
  await setToken(token);
  await setProfile({ email, tier });
}
