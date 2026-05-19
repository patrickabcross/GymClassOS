// First-launch member-picker (D-05). Lists 5 seeded gym members. Tap to
// persist the id to AsyncStorage and jump to the 4-tab shell.
// Caption verbatim per D-06: "Demo only — production uses WhatsApp magic-link".
import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "../lib/api";
import { setCurrentMemberId } from "../lib/current-member";

type Member = { id: string; firstName: string; lastName: string | null };

export default function PickMember() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/m/members/list")
      .then((d) => setMembers(d.members))
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  async function pick(id: string) {
    await setCurrentMemberId(id);
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who are you?</Text>
      <Text style={styles.subtitle}>
        Demo only — production uses WhatsApp magic-link
      </Text>

      {members === null && !error && (
        <View style={{ marginTop: 32 }}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      {members && (
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingTop: 24, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => pick(item.id)}>
              <Text style={styles.rowText}>
                {item.firstName} {item.lastName ?? ""}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    padding: 24,
    paddingTop: 80,
  },
  title: { color: "#fff", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#999", fontSize: 14, marginTop: 8 },
  row: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 12,
  },
  rowText: { color: "#fff", fontSize: 18 },
  error: { color: "#f88", marginTop: 24 },
});
