// Better-auth email sign-in — plain Bearer flow (MA1-02).
// NO expo() plugin needed (it does not exist in better-auth 1.6.0).
// The server returns the session token in the `set-auth-token` response
// header (exact name confirmed from better-auth/dist/plugins/bearer/index.mjs).
//
// RESEARCH Finding 3: header is `set-auth-token` (lowercase, hyphenated, exact).
// RESEARCH Pitfall 5: this endpoint returns 200 (not a 302), so the header is
// readable directly without following a redirect.
import { API_BASE_URL } from "./api";
import { setSessionToken } from "./session";

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<void> {
  // Better-auth enforces an Origin check on cookie-setting endpoints. A request
  // with no Origin header is rejected 403 MISSING_OR_NULL_ORIGIN. React Native's
  // fetch does not set Origin, so send the API base (a trusted origin by
  // default = baseURL) explicitly. Verified against the live endpoint during the
  // MA1 spike — the seed hit the same 403 until this header was added.
  const res = await fetch(
    `${API_BASE_URL}/_agent-native/auth/ba/sign-in/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: API_BASE_URL,
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sign-in failed (${res.status}): ${text.slice(0, 200)}`);
  }
  // RESEARCH Finding 3 — exact header name (lowercase, hyphenated).
  const token = res.headers.get("set-auth-token");
  if (!token) throw new Error("No set-auth-token header in sign-in response");
  await setSessionToken(token);
}
