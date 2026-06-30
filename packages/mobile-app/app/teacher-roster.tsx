// Teacher roster + tap-to-check-in screen (TCH-02). Pushed from the teacher
// schedule tab with { occurrenceId, title } params. Lists the session's booked
// members (GET /api/m/teacher/roster?occurrenceId=) and lets the teacher tap a
// member to check them in — optimistically (mirrors schedule.tsx bookMutation:
// onMutate cache patch + onError rollback + onSuccess invalidate). Check-in
// drives POST /api/m/teacher/check-in, which is a pure caller of the existing
// mark-booking-attended chokepoint (MA3-02). No AI/agent surface here (TCH-03).
import { useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";
import { useTheme } from "../lib/theme";

type RosterRow = {
  bookingId: string;
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
};

function fullName(r: RosterRow) {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : "Member";
}

export default function TeacherRosterScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{
    occurrenceId?: string;
    title?: string;
  }>();
  const occurrenceId = params.occurrenceId ?? "";
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
        },
        center: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: theme.spacing.xl,
        },
        title: {
          color: theme.colors.foreground,
          fontSize: 20,
          fontFamily: theme.font.bold,
          marginBottom: theme.spacing.md,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          padding: 14,
          marginBottom: theme.spacing.sm,
          gap: 12,
        },
        name: {
          flex: 1,
          color: theme.colors.foreground,
          fontSize: 16,
          fontFamily: theme.font.semibold,
        },
        attendedBadge: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: theme.colors.success,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: theme.radius.pill,
        },
        attendedText: {
          color: theme.colors.accentForeground,
          fontSize: 12,
          fontFamily: theme.font.semibold,
        },
        checkInBtn: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 8,
          borderRadius: theme.radius.sm,
        },
        checkInText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.semibold,
          fontSize: 13,
        },
        error: {
          color: theme.colors.danger,
          marginBottom: theme.spacing.lg,
          fontFamily: theme.font.regular,
        },
        emptyText: {
          color: theme.colors.mutedFaint,
          marginTop: 32,
          fontFamily: theme.font.regular,
          textAlign: "center",
        },
        toast: {
          backgroundColor: theme.colors.dangerSoft,
          padding: 12,
          borderRadius: theme.radius.sm,
          marginBottom: theme.spacing.sm,
        },
        toastText: {
          color: theme.colors.foreground,
          fontSize: 13,
          fontFamily: theme.font.regular,
        },
        btn: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 12,
          borderRadius: theme.radius.sm,
          alignItems: "center",
        },
        btnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.semibold,
        },
      }),
    [theme],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["teacher-roster", occurrenceId],
    queryFn: () =>
      apiFetch(
        `/api/m/teacher/roster?occurrenceId=${encodeURIComponent(occurrenceId)}`,
      ),
    enabled: occurrenceId.length > 0,
  });

  const checkIn = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch("/api/m/teacher/check-in", {
        method: "POST",
        body: JSON.stringify({ bookingId }),
      }),
    onMutate: async (bookingId: string) => {
      // Optimistic — flip the row to attended immediately.
      await qc.cancelQueries({ queryKey: ["teacher-roster", occurrenceId] });
      const previous = qc.getQueryData<any>(["teacher-roster", occurrenceId]);
      qc.setQueryData<any>(["teacher-roster", occurrenceId], (old: any) => {
        if (!old?.roster) return old;
        return {
          ...old,
          roster: old.roster.map((r: RosterRow) =>
            r.bookingId === bookingId ? { ...r, status: "attended" } : r,
          ),
        };
      });
      return { previous };
    },
    onError: (err: any, _bookingId, ctx) => {
      // Rollback the optimistic patch + show an inline error toast.
      if (ctx?.previous)
        qc.setQueryData(["teacher-roster", occurrenceId], ctx.previous);
      setCheckInError(String(err?.message ?? err));
      setTimeout(() => setCheckInError(null), 4000);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["teacher-roster", occurrenceId] }),
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn&apos;t load the roster</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const roster: RosterRow[] = data?.roster ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{params.title ?? "Roster"}</Text>
      {checkInError && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{checkInError}</Text>
        </View>
      )}
      <FlatList
        data={roster}
        keyExtractor={(r) => r.bookingId}
        renderItem={({ item: r }) => {
          const attended = r.status === "attended";
          return (
            <View style={styles.row}>
              <Feather name="user" size={18} color={theme.colors.mutedFaint} />
              <Text style={styles.name}>{fullName(r)}</Text>
              {attended ? (
                <View style={styles.attendedBadge}>
                  <Feather
                    name="check"
                    size={14}
                    color={theme.colors.accentForeground}
                  />
                  <Text style={styles.attendedText}>Checked in</Text>
                </View>
              ) : (
                <Pressable
                  style={[
                    styles.checkInBtn,
                    checkIn.isPending && { opacity: 0.6 },
                  ]}
                  disabled={checkIn.isPending}
                  onPress={() => checkIn.mutate(r.bookingId)}
                >
                  <Text style={styles.checkInText}>Check in</Text>
                </Pressable>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No one booked yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </View>
  );
}
