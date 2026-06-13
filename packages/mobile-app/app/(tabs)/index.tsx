import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import KcalRing from "../../components/KcalRing";
import { useTheme } from "../../lib/theme";

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
  const theme = useTheme();
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

  const styles = useMemo(
    () => ({
      container: { flex: 1, backgroundColor: theme.colors.background },
      center: {
        flex: 1,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
      },
      greeting: {
        color: theme.colors.foreground,
        fontSize: 32,
        fontFamily: theme.font.bold,
      },
      pill: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        alignSelf: "flex-start" as const,
        gap: 6,
        backgroundColor: theme.colors.cardElevated,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: theme.radius.pill,
        marginTop: theme.spacing.sm,
      },
      pillRed: { backgroundColor: theme.colors.dangerSoft },
      pillText: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontFamily: theme.font.semibold,
      },
      card: {
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.md,
        padding: theme.spacing.lg,
        marginTop: theme.spacing.lg,
      },
      sectionLabel: {
        color: theme.colors.muted,
        fontSize: 12,
        fontFamily: theme.font.semibold,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
        marginBottom: theme.spacing.sm,
      },
      bookingRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingVertical: 4,
      },
      bookingTitle: {
        color: theme.colors.foreground,
        fontSize: 18,
        fontFamily: theme.font.semibold,
      },
      bookingTime: {
        color: theme.colors.muted,
        fontSize: 14,
        marginTop: 4,
        fontFamily: theme.font.regular,
      },
      macroLine: {
        color: theme.colors.foreground,
        fontSize: 16,
        textAlign: "center" as const,
        marginTop: theme.spacing.sm,
        fontVariant: ["tabular-nums"] as const,
        fontFamily: theme.font.regular,
      },
      macroTargets: {
        color: theme.colors.mutedFaint,
        fontSize: 12,
        textAlign: "center" as const,
        marginTop: 4,
        fontFamily: theme.font.regular,
      },
      btn: {
        backgroundColor: theme.colors.accent,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: 12,
        borderRadius: theme.radius.sm,
        alignItems: "center" as const,
      },
      btnText: {
        color: theme.colors.accentForeground,
        fontFamily: theme.font.semibold,
      },
      error: { color: theme.colors.danger, fontFamily: theme.font.regular },
    }),
    [theme],
  );

  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.foreground} />
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
        <Feather name="award" size={14} color={theme.colors.foreground} />
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
            <Feather name="chevron-right" size={20} color={theme.colors.mutedFaint} />
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
            <Feather name="chevron-right" size={20} color={theme.colors.mutedFaint} />
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
