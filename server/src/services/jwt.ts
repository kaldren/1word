import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface GoogleClaims {
  sub: string;
  email: string;
  email_verified: boolean;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  nonce: string,
): Promise<GoogleClaims> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("google_token_missing_claims");
  }
  if (payload.email_verified !== true) {
    throw new Error("email_not_verified");
  }
  if (payload.nonce !== nonce) {
    throw new Error("nonce_mismatch");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: true,
  };
}

export interface SessionClaims {
  sub: string;
}

const SESSION_ALG = "HS256";
const SESSION_TTL = "7d";

function keyFor(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issueSessionJwt(
  userId: string,
  secret: string,
): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: SESSION_ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(keyFor(secret));
}

export async function verifySessionJwt(
  token: string,
  secret: string,
): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, keyFor(secret), {
    algorithms: [SESSION_ALG],
  });
  if (typeof payload.sub !== "string") {
    throw new Error("session_missing_sub");
  }
  return { sub: payload.sub };
}
