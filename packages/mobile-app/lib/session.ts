// Secure-store session token persistence — MA1-02.
// Replaces current-member.ts (AsyncStorage demoMemberId) with a real
// Better-auth Bearer token stored in expo-secure-store (never AsyncStorage).
//
// SESSION_TOKEN_KEY is the single source of truth: api.ts, agent-stream.ts,
// sign-in-api.ts, and _layout.tsx all reference this constant — no per-file
// string literals.
import * as SecureStore from "expo-secure-store";

export const SESSION_TOKEN_KEY = "session_token";

export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function setSessionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
