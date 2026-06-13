// Passes tab — shows the member's pass balance and activity history.
// Data reuses /api/m/profile (passBalance). History is future-proof:
// when the API adds a passHistory array, the .map below renders rows
// automatically without a rewrite (MOBL-02 / R5-02).
import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProfileResponse = {
  member: {
    id: string;
    firstName: string;
    lastName: string | null;
    goal: string | null;
  };
  passBalance: number;
  upcomingBooking: {
    bookingId: string;
    occurrenceId: string;
    startsAt: string;
    className: string | null;
  } | null;
  today: { kcal: number; targetKcal: number };
  // Future-proof: history will be appended to this response
  passHistory?: PassEvent[];
};

export type PassEvent = {
  id: string;
  occurredAt: string;
  description: string;
  delta: number; // +N = added, -1 = consumed
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PassesScreen() {
  const theme = useTheme();

  const { data, isLoading, error, refetch } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  // Refetch on tab focus so a booking spending a credit reflects here
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        center: {
          flex: 1,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          backgroundColor: theme.colors.background,
          padding: theme.spacing.xl,
          gap: theme.spacing.lg,
        },
        errorText: {
          color: theme.colors.danger,
          fontSize: 15,
          textAlign: "center" as const,
          fontFamily: theme.font.regular,
        },
        retryBtn: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.sm,
          alignItems: "center" as const,
        },
        retryBtnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.semibold,
          fontSize: 15,
        },
        // Balance hero
        balanceSection: {
          alignItems: "center" as const,
          paddingTop: 40,
          paddingBottom: 32,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.xs,
        },
        balanceLabel: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.semibold,
          textTransform: "uppercase" as const,
          letterSpacing: 0.8,
        },
        balanceNumber: {
          fontSize: 72,
          fontFamily: theme.font.bold,
          lineHeight: 80,
        },
        balanceUnit: {
          fontSize: 18,
          fontFamily: theme.font.regular,
          marginTop: -4,
        },
        balancePill: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: theme.radius.pill,
          marginTop: theme.spacing.sm,
        },
        balancePillText: {
          fontSize: 13,
          fontFamily: theme.font.semibold,
        },
        divider: {
          height: 1,
          backgroundColor: theme.colors.border,
          marginHorizontal: theme.spacing.xl,
          marginBottom: theme.spacing.lg,
        },
        // History section
        historySection: {
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.sm,
        },
        historyHeader: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.semibold,
          textTransform: "uppercase" as const,
          letterSpacing: 0.5,
          marginBottom: theme.spacing.xs,
        },
        emptyState: {
          alignItems: "center" as const,
          paddingVertical: 32,
          gap: 8,
        },
        emptyText: {
          color: theme.colors.muted,
          fontSize: 15,
          fontFamily: theme.font.regular,
        },
        emptyHint: {
          color: theme.colors.mutedFaint,
          fontSize: 13,
          fontFamily: theme.font.regular,
          textAlign: "center" as const,
        },
        // History rows (rendered when passHistory array exists)
        historyRow: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          backgroundColor: theme.colors.card,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
        },
        historyDesc: {
          color: theme.colors.foreground,
          fontSize: 14,
          fontFamily: theme.font.regular,
          flex: 1,
        },
        historyDate: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          fontFamily: theme.font.regular,
          marginTop: 2,
        },
        historyDelta: {
          fontSize: 14,
          fontFamily: theme.font.semibold,
        },
      }),
    [theme],
  );

  // Loading state
  if (isLoading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  // Error / 401 graceful state
  if (error || !data) {
    return (
      <View style={styles.center}>
        <Feather name="wifi-off" size={32} color={theme.colors.muted} />
        <Text style={styles.errorText}>
          {"Couldn't load pass balance\n(you may need to log in)"}
        </Text>
        <Pressable onPress={() => refetch()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { passBalance, passHistory } = data;
  const lowBalance = passBalance <= 0;

  // Pill: green-ish on normal, danger on low
  const pillBg = lowBalance ? theme.colors.dangerSoft : theme.colors.accentSoft;
  const pillText = lowBalance ? theme.colors.danger : theme.colors.accent;
  const pillStatus = lowBalance ? "No credits remaining" : "Ready to book";

  const balanceColor = lowBalance
    ? theme.colors.danger
    : theme.colors.foreground;
  const unitColor = lowBalance ? theme.colors.danger : theme.colors.muted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 96 }}
    >
      {/* Balance hero */}
      <View style={styles.balanceSection}>
        <Text style={styles.balanceLabel}>Pass Balance</Text>
        <Text style={[styles.balanceNumber, { color: balanceColor }]}>
          {passBalance}
        </Text>
        <Text style={[styles.balanceUnit, { color: unitColor }]}>
          {passBalance === 1 ? "credit" : "credits"}
        </Text>
        <View style={[styles.balancePill, { backgroundColor: pillBg }]}>
          <Feather
            name={lowBalance ? "alert-circle" : "check-circle"}
            size={14}
            color={pillText}
          />
          <Text style={[styles.balancePillText, { color: pillText }]}>
            {pillStatus}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* History section */}
      <View style={styles.historySection}>
        <Text style={styles.historyHeader}>Pass history</Text>

        {/* Render rows if the API eventually provides passHistory */}
        {passHistory && passHistory.length > 0 ? (
          passHistory.map((evt) => {
            const deltaPositive = evt.delta > 0;
            return (
              <View key={evt.id} style={styles.historyRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.historyDesc}>{evt.description}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(evt.occurredAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyDelta,
                    {
                      color: deltaPositive
                        ? theme.colors.success
                        : theme.colors.muted,
                    },
                  ]}
                >
                  {deltaPositive ? `+${evt.delta}` : String(evt.delta)}
                </Text>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={28} color={theme.colors.mutedFaint} />
            <Text style={styles.emptyText}>No pass activity yet</Text>
            <Text style={styles.emptyHint}>
              Credits used to book classes will appear here
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
