// Mobile fetch wrapper that injects X-Demo-Member-Id (D-07) on every request.
// All TanStack Query queryFns route through here.
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081";

export async function apiFetch(path: string, init?: RequestInit) {
  const memberId = await AsyncStorage.getItem("demoMemberId");
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(memberId ? { "X-Demo-Member-Id": memberId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const API_BASE_URL = API_BASE;
