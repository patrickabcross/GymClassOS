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
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme";

type Item = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  className: string | null;
  category: string | null;
  durationMin: number | null;
  bookedCount: number;
  isBookedByMe: boolean;
  full: boolean;
};

type Section = { day: string; items: Item[] };

function dayKey(iso: string) {
  // Demo: UTC date bucket. Production (SCH-07) uses the studio IANA TZ.
  return iso.slice(0, 10);
}
function dayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScheduleScreen() {
  const theme = useTheme();
  const qc = useQueryClient();

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
        sectionHeader: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.semibold,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
        },
        card: {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          marginBottom: theme.spacing.sm,
          overflow: "hidden",
        },
        cardHeader: {
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          gap: 12,
        },
        time: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.regular,
        },
        className: {
          color: theme.colors.foreground,
          fontSize: 16,
          fontFamily: theme.font.semibold,
          marginTop: 2,
        },
        meta: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          fontFamily: theme.font.regular,
          marginTop: 2,
        },
        bookedBadge: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: theme.colors.success,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: theme.radius.pill,
        },
        bookedBadgeText: {
          color: theme.colors.accentForeground,
          fontSize: 12,
          fontFamily: theme.font.semibold,
        },
        expandRow: {
          paddingHorizontal: 14,
          paddingBottom: 14,
          paddingTop: 4,
        },
        fullText: {
          color: theme.colors.danger,
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
        btnSecondary: {
          backgroundColor: theme.colors.cardElevated,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 12,
          borderRadius: theme.radius.sm,
          alignItems: "center",
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        btnSecondaryText: {
          color: theme.colors.foreground,
          fontFamily: theme.font.semibold,
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
        error: {
          color: theme.colors.danger,
          marginBottom: theme.spacing.lg,
          fontFamily: theme.font.regular,
        },
        emptyText: {
          color: theme.colors.mutedFaint,
          marginTop: 32,
          fontFamily: theme.font.regular,
        },
        // Pass balance pill (persistent header above the FlatList)
        pillRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: theme.radius.pill,
          alignSelf: "flex-end",
          marginBottom: theme.spacing.sm,
        },
        pillRowNormal: {
          backgroundColor: theme.colors.accentSoft,
        },
        pillRowLow: {
          backgroundColor: theme.colors.dangerSoft,
        },
        pillText: {
          fontSize: 13,
          fontFamily: theme.font.semibold,
        },
        pillTextNormal: {
          color: theme.colors.accent,
        },
        pillTextLow: {
          color: theme.colors.danger,
        },
        // Confirm step: choice row between "Use pass" and "Pay drop-in"
        choiceRow: {
          flexDirection: "row",
          gap: theme.spacing.sm,
        },
        choiceHint: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.regular,
          marginBottom: theme.spacing.sm,
        },
      }),
    [theme],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["schedule"],
    queryFn: () => apiFetch("/api/m/schedule"),
  });

  // Pass balance: read from the shared ["profile"] query — same key as Home tab
  // and the booking mutation's onSuccess invalidation. The pill auto-updates
  // after a booking spends a credit because onSuccess calls
  //   qc.invalidateQueries({ queryKey: ["profile"] })
  // which triggers a refetch of this query and the pill re-renders.
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });
  const passBalance: number = profileData?.passBalance ?? 0;
  const lowBalance = passBalance <= 0;

  const sections = useMemo<Section[]>(() => {
    const items: Item[] = data?.items ?? [];
    const grouped = new Map<string, Item[]>();
    for (const it of items) {
      const k = dayKey(it.startsAt);
      const arr = grouped.get(k) ?? [];
      arr.push(it);
      grouped.set(k, arr);
    }
    return Array.from(grouped.entries()).map(([day, items]) => ({
      day,
      items,
    }));
  }, [data]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  const bookMutation = useMutation({
    mutationFn: async ({
      occurrenceId,
      usePass,
    }: {
      occurrenceId: string;
      usePass: boolean;
    }) => {
      // POST /api/m/bookings — existing endpoint. The usePass choice is
      // recorded client-side; Stripe drop-in purchase flow is a master-branch
      // concern (P1c.1) and not wired here. When the payment endpoint exists,
      // pass { occurrenceId, paymentMethod: usePass ? "pass" : "drop-in" }.
      return apiFetch("/api/m/bookings", {
        method: "POST",
        body: JSON.stringify({ occurrenceId }),
      });
    },
    onMutate: async ({ occurrenceId }) => {
      // Optimistic — mark the occurrence as isBookedByMe immediately
      await qc.cancelQueries({ queryKey: ["schedule"] });
      const previous = qc.getQueryData<any>(["schedule"]);
      qc.setQueryData<any>(["schedule"], (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((it: Item) =>
            it.id === occurrenceId
              ? { ...it, isBookedByMe: true, bookedCount: it.bookedCount + 1 }
              : it,
          ),
        };
      });
      setExpandedId(null);
      return { previous };
    },
    onError: (err: any, _vars, ctx) => {
      // Rollback
      if (ctx?.previous) qc.setQueryData(["schedule"], ctx.previous);
      setBookError(String(err?.message ?? err));
      setTimeout(() => setBookError(null), 4000);
    },
    onSuccess: () => {
      // Refresh profile — updates the Home tab's upcomingBooking AND the
      // persistent pass-balance pill on this screen.
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
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
        <Text style={styles.error}>Couldn&apos;t load schedule</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Persistent pass-balance pill ───────────────────────────── */}
      {/* Rendered outside FlatList so it stays visible while the user
          scrolls through classes. Updates automatically when the
          ["profile"] query refreshes (e.g. after a booking). */}
      <View
        style={[
          styles.pillRow,
          lowBalance ? styles.pillRowLow : styles.pillRowNormal,
        ]}
      >
        <Feather
          name="award"
          size={14}
          color={lowBalance ? theme.colors.danger : theme.colors.accent}
        />
        <Text
          style={[
            styles.pillText,
            lowBalance ? styles.pillTextLow : styles.pillTextNormal,
          ]}
        >
          {passBalance} {passBalance === 1 ? "credit" : "credits"}
        </Text>
      </View>

      {bookError && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{bookError}</Text>
        </View>
      )}

      <FlatList
        data={sections}
        keyExtractor={(s) => s.day}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>
              {dayLabel(section.items[0].startsAt)}
            </Text>
            {section.items.map((it) => {
              const expanded = expandedId === it.id;
              return (
                <View key={it.id} style={styles.card}>
                  {/* ── Step 1: Select — tap card to expand ────────── */}
                  <Pressable
                    onPress={() => setExpandedId(expanded ? null : it.id)}
                    style={styles.cardHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.time}>{timeLabel(it.startsAt)}</Text>
                      <Text style={styles.className}>
                        {it.className ?? "Class"}
                      </Text>
                      <Text style={styles.meta}>
                        {it.bookedCount}/{it.capacity}{" "}
                        {it.category ? `· ${it.category}` : ""}
                      </Text>
                    </View>
                    {it.isBookedByMe ? (
                      <View style={styles.bookedBadge}>
                        <Feather
                          name="check"
                          size={14}
                          color={theme.colors.accentForeground}
                        />
                        <Text style={styles.bookedBadgeText}>Booked</Text>
                      </View>
                    ) : (
                      <Feather
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color={theme.colors.mutedFaint}
                      />
                    )}
                  </Pressable>

                  {/* ── Step 2: Confirm — choose pass or drop-in ───── */}
                  {expanded && !it.isBookedByMe && (
                    <View style={styles.expandRow}>
                      {it.full ? (
                        <Text style={styles.fullText}>This class is full</Text>
                      ) : passBalance > 0 ? (
                        <>
                          {/* Member has passes: offer both options */}
                          <Text style={styles.choiceHint}>
                            How would you like to book?
                          </Text>
                          <View style={styles.choiceRow}>
                            <Pressable
                              style={[
                                styles.btn,
                                { flex: 1 },
                                bookMutation.isPending && { opacity: 0.6 },
                              ]}
                              disabled={bookMutation.isPending}
                              onPress={() =>
                                bookMutation.mutate({
                                  occurrenceId: it.id,
                                  usePass: true,
                                })
                              }
                            >
                              <Text style={styles.btnText}>Use 1 pass</Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.btnSecondary,
                                { flex: 1 },
                                bookMutation.isPending && { opacity: 0.6 },
                              ]}
                              disabled={bookMutation.isPending}
                              onPress={() =>
                                bookMutation.mutate({
                                  occurrenceId: it.id,
                                  usePass: false,
                                })
                              }
                            >
                              {/* drop-in payment (Stripe purchase) is wired
                                  in the master-branch P1c.1 workstream */}
                              <Text style={styles.btnSecondaryText}>
                                Pay drop-in
                              </Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <>
                          {/* No passes: only drop-in available */}
                          <Text style={styles.choiceHint}>
                            You have no credits — pay drop-in to book.
                          </Text>
                          <Pressable
                            style={[
                              styles.btn,
                              bookMutation.isPending && { opacity: 0.6 },
                            ]}
                            disabled={bookMutation.isPending}
                            onPress={() =>
                              bookMutation.mutate({
                                occurrenceId: it.id,
                                usePass: false,
                              })
                            }
                          >
                            {/* drop-in payment (Stripe purchase) is wired
                                in the master-branch P1c.1 workstream */}
                            <Text style={styles.btnText}>Pay drop-in</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  )}
                  {/* Step 3: Done — optimistic booked badge on card header ↑ */}
                </View>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No upcoming classes this week</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </View>
  );
}
