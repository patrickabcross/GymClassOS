// Demo-only AsyncStorage persistence of the picked member id.
// D2-01 / D-05: first-launch picker writes here; subsequent app opens read here;
// long-press on Profile clears here. Replaced in P1a by Better-auth sessions.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "demoMemberId";

export async function getCurrentMemberId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function setCurrentMemberId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEY, id);
}

export async function clearCurrentMemberId(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
