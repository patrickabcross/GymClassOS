// Profile tab — shows the picked member's name + a long-press affordance to
// clear AsyncStorage and switch demo persona (D-05). Profile content polish
// (passes timeline, edit name, etc.) is P2 / MEMBR-05.
import { useMemo, useState } from "react";
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
import { useTheme } from "../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });
  const [confirming, setConfirming] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
          padding: 24,
          gap: 8,
        },
        center: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
          gap: 12,
        },
        errorText: {
          color: theme.colors.danger,
          fontFamily: theme.font.regular,
          fontSize: 15,
        },
        name: {
          color: theme.colors.foreground,
          fontSize: 28,
          fontFamily: theme.font.bold,
          marginTop: 32,
        },
        subtitle: {
          color: theme.colors.muted,
          fontSize: 16,
          fontFamily: theme.font.regular,
        },
        hint: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          marginTop: 24,
          fontFamily: theme.font.regular,
        },
        btn: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: theme.radius.sm,
        },
        btnSecondary: {
          backgroundColor: theme.colors.cardElevated,
        },
        btnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.semibold,
        },
        confirmBox: {
          backgroundColor: theme.colors.card,
          padding: 16,
          borderRadius: theme.radius.md,
          marginTop: 32,
          gap: 12,
        },
        confirmText: {
          color: theme.colors.foreground,
          fontFamily: theme.font.regular,
        },
        confirmRow: {
          flexDirection: "row",
          gap: 12,
          justifyContent: "flex-end",
        },
      }),
    [theme],
  );

  async function switchMember() {
    await clearCurrentMemberId();
    router.replace("/pick-member");
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }
  if (error || !data?.member) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn't load profile</Text>
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
