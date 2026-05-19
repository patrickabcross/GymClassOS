import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import KcalRing from "../../components/KcalRing";

type ProfileResponse = {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phoneE164: string | null;
    goal: string | null;
  };
  passBalance: number;
  upcomingBooking: {
    bookingId: string;
    occurrenceId: string;
    startsAt: string;
    className: string | null;
  } | null;
  today: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    targetKcal: number;
    targetProteinG: number;
    targetCarbsG: number;
    targetFatG: number;
  };
};

function bookingTimeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  return (
    d.toLocaleDateString("en-GB", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) + ` at ${time}`
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  // Refetch on tab focus so a booking made on Schedule reflects here
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load home</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { member, passBalance, upcomingBooking, today } = data;
  const lowBalance = passBalance <= 0;
  const fmt = (n: number) => Math.round(n);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 24, paddingBottom: 96 }}
    >
      <Text style={styles.greeting}>Hi {member.firstName}</Text>
      <View style={[styles.pill, lowBalance && styles.pillRed]}>
        <Feather name="award" size={14} color="#fff" />
        <Text style={styles.pillText}>
          {passBalance} {passBalance === 1 ? "credit" : "credits"}
        </Text>
      </View>

      {/* Upcoming booking */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Next class</Text>
        {upcomingBooking ? (
          <Pressable
            onPress={() => router.push("/(tabs)/schedule")}
            style={styles.bookingRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.bookingTitle}>
                {upcomingBooking.className ?? "Class"}
              </Text>
              <Text style={styles.bookingTime}>
                {bookingTimeLabel(upcomingBooking.startsAt)}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#666" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push("/(tabs)/schedule")}
            style={styles.bookingRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.bookingTitle}>No upcoming class</Text>
              <Text style={styles.bookingTime}>Tap to browse the schedule</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#666" />
          </Pressable>
        )}
      </View>

      {/* Today's nutrition */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Today</Text>
        <View style={{ alignItems: "center", marginVertical: 16 }}>
          <KcalRing value={fmt(today.kcal)} target={today.targetKcal} />
        </View>
        <Text style={styles.macroLine}>
          P {fmt(today.proteinG)}g{"  "}C {fmt(today.carbsG)}g{"  "}F{" "}
          {fmt(today.fatG)}g
        </Text>
        <Text style={styles.macroTargets}>
          Target P {today.targetProteinG}g · C {today.targetCarbsG}g · F{" "}
          {today.targetFatG}g
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/food")}
          style={[styles.btn, { marginTop: 16 }]}
        >
          <Text style={styles.btnText}>+ Log a meal</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    padding: 24,
    gap: 16,
  },
  greeting: { color: "#fff", fontSize: 32, fontWeight: "700" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    backgroundColor: "#1f2937",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 8,
  },
  pillRed: { backgroundColor: "#7f1d1d" },
  pillText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  sectionLabel: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  bookingTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  bookingTime: { color: "#999", fontSize: 14, marginTop: 4 },
  macroLine: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
    fontVariant: ["tabular-nums"],
  },
  macroTargets: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  btn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  error: { color: "#f88" },
});
