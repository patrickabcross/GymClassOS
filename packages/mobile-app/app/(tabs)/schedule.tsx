import { useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import { getSessionToken } from "../../lib/session";
import {
  setPendingBooking,
  getPendingBooking,
  clearPendingBooking,
} from "../../lib/pending-booking";
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

// Optimistically mark an occurrence as booked-by-me in the ["schedule"] cache.
function markBookedInSchedule(occurrenceId: string) {
  return (old: any) => {
    if (!old?.items) return old;
    return {
      ...old,
      items: old.items.map((it: Item) =>
        it.id === occurrenceId
          ? { ...it, isBookedByMe: true, bookedCount: it.bookedCount + 1 }
          : it,
      ),
    };
  };
}

export default function ScheduleScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const router = useRouter();

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
  // Occurrence the member is buying a pass for (drives the no-pass product
  // picker — the picker UI + purchase→poll→re-book flow are wired in Task 2).
  const [purchaseOccurrenceId, setPurchaseOccurrenceId] = useState<
    string | null
  >(null);

  function showBookError(msg: string, ms = 4000) {
    setBookError(msg);
    setTimeout(() => setBookError(null), ms);
  }

  const bookMutation = useMutation({
    mutationFn: async ({ occurrenceId }: { occurrenceId: string }) => {
      return apiFetch("/api/m/bookings", {
        method: "POST",
        body: JSON.stringify({ occurrenceId }),
      });
    },
    onMutate: async ({ occurrenceId }) => {
      // Optimistic — mark the occurrence as isBookedByMe immediately
      await qc.cancelQueries({ queryKey: ["schedule"] });
      const previous = qc.getQueryData<any>(["schedule"]);
      qc.setQueryData<any>(["schedule"], markBookedInSchedule(occurrenceId));
      setExpandedId(null);
      return { previous };
    },
    onError: (err: any, vars, ctx) => {
      // Always roll back the optimistic card flip.
      if (ctx?.previous) qc.setQueryData(["schedule"], ctx.previous);
      const msg = String(err?.message ?? err);
      if (msg.includes("NO_PASS") || msg.includes("402")) {
        // Not an error — the member just has no credit. Open the product
        // picker so they can buy a pass (Task 2 renders + drives the flow).
        startPurchaseFlow(vars.occurrenceId);
        return;
      }
      if (msg.includes("CAPACITY_FULL") || msg.includes("409")) {
        // Race: the class filled between render and book. Soft message, not red.
        showBookError("Sorry — this class just filled up.");
        return;
      }
      showBookError(msg);
    },
    onSuccess: () => {
      // Refresh profile — updates the Home tab's upcomingBooking AND the
      // persistent pass-balance pill on this screen.
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // Open the no-pass purchase flow for an occurrence. Task 1 records the
  // intent (which opens the picker); Task 2 fetches the products, renders the
  // ProductPickerSheet, and runs the Stripe → poll-for-grant → re-book flow.
  const startPurchaseFlow = useCallback((occurrenceId: string) => {
    setPurchaseOccurrenceId(occurrenceId);
  }, []);

  // Run the booking path for a signed-in member: a pass-holder books
  // optimistically; a member with no credit is routed to the purchase flow.
  // The server is the source of truth — even a stale "has credit" client lands
  // in the NO_PASS branch of onError, which opens the picker.
  const bookForSignedInMember = useCallback(
    (occurrenceId: string) => {
      if (passBalance > 0) {
        bookMutation.mutate({ occurrenceId });
      } else {
        startPurchaseFlow(occurrenceId);
      }
    },
    [passBalance, bookMutation, startPurchaseFlow],
  );

  // Book-press auth gate (MEM-02). The wall lives HERE, not at app entry:
  // a signed-out tap stores the occurrence intent and routes to /sign-in;
  // the resume-on-focus effect below completes the booking after sign-in.
  const handleBookPress = useCallback(
    async (occurrenceId: string) => {
      setBookError(null);
      const token = await getSessionToken();
      if (!token) {
        setPendingBooking(occurrenceId);
        router.push("/sign-in");
        return;
      }
      bookForSignedInMember(occurrenceId);
    },
    [router, bookForSignedInMember],
  );

  // Resume-after-sign-in (MEM-02). On focus, if a pending booking intent
  // exists AND we now have a session token, consume the intent and re-issue
  // the booking. A ref guards against a double-fire so it resumes exactly once.
  const resumedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const pending = getPendingBooking();
      if (!pending || resumedRef.current) return;
      (async () => {
        const token = await getSessionToken();
        if (!token) return; // still signed out — leave the intent for later
        resumedRef.current = true;
        clearPendingBooking();
        // Let the server decide (pass vs no-pass) — booking onError opens the
        // picker on NO_PASS. Don't trust a possibly-stale client passBalance.
        bookMutation.mutate({ occurrenceId: pending });
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

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

                  {/* ── Step 2: Confirm — one Book action ───────────── */}
                  {/* The auth wall + pass/no-pass branching all live behind
                      handleBookPress; no bare "pay drop-in" booking here. */}
                  {expanded && !it.isBookedByMe && (
                    <View style={styles.expandRow}>
                      {it.full ? (
                        <Text style={styles.fullText}>This class is full</Text>
                      ) : (
                        <>
                          <Text style={styles.choiceHint}>
                            {passBalance > 0
                              ? "Booking uses 1 credit."
                              : "Reserve your spot — pay at checkout if you have no credits."}
                          </Text>
                          <Pressable
                            style={[
                              styles.btn,
                              bookMutation.isPending && { opacity: 0.6 },
                            ]}
                            disabled={bookMutation.isPending}
                            onPress={() => handleBookPress(it.id)}
                          >
                            <Text style={styles.btnText}>Book</Text>
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
