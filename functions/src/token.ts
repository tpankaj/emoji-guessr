import { createHmac, timingSafeEqual } from "node:crypto";

/** Per-question progress, carried by the client but signed by the server. */
export interface TokenState {
  v: string; // quiz id
  q: number; // question id
  n: number; // guesses used
  done: boolean;
}

function mac(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signToken(state: TokenState, secret: string): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

export function verifyToken(token: string, secret: string): TokenState | null {
  if (typeof token !== "string") return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = mac(body, secret);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (
      typeof s?.v !== "string" ||
      typeof s?.q !== "number" ||
      typeof s?.n !== "number" ||
      typeof s?.done !== "boolean"
    ) {
      return null;
    }
    return { v: s.v, q: s.q, n: s.n, done: s.done };
  } catch {
    return null;
  }
}
