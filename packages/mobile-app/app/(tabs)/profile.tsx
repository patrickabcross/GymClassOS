// Profile tab — shows the picked member's name + a long-press affordance to
// clear AsyncStorage and switch demo persona (D-05). Profile content polish
// (passes timeline, edit name, etc.) is P2 / MEMBR-05.
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import { clearCurrentMemberId } from "../../lib/current-member";

export default function ProfileScreen() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });
  const [confirming, setConfirming] = useState(false);

  async function switchMember() {
    await clearCurrentMemberId();
    router.replace("/pick-member");
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error || !data?.member) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#f88" }}>Couldn't load profile</Text>
        <Pressable onPress={switchMember} style={styles.btn}>
          <Text style={styles.btnText}>Switch member</Text>
        </Pressable>
      </View>
    );
  }

  const m = data.member;
  return (
    <Pressable
      onLongPress={() => setConfirming(true)}
      delayLongPress={600}
      style={styles.container}
    >
      <Text style={styles.name}>
        {m.firstName} {m.lastName ?? ""}
      </Text>
      <Text style={styles.subtitle}>{m.email ?? m.phoneE164 ?? ""}</Text>
      <Text style={styles.hint}>
        Long-press anywhere to switch member (demo)
      </Text>

      {confirming && (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>Switch demo member?</Text>
          <View style={styles.confirmRow}>
            <Pressable
              onPress={() => setConfirming(false)}
              style={[styles.btn, styles.btnSecondary]}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={switchMember} style={styles.btn}>
              <Text style={styles.btnText}>Switch</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 24, gap: 8 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    gap: 12,
  },
  name: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: 32 },
  subtitle: { color: "#999", fontSize: 16 },
  hint: { color: "#555", fontSize: 12, marginTop: 24 },
  btn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnSecondary: { backgroundColor: "#333" },
  btnText: { color: "#fff", fontWeight: "600" },
  confirmBox: {
    backgroundColor: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    marginTop: 32,
    gap: 12,
  },
  confirmText: { color: "#fff" },
  confirmRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
});
