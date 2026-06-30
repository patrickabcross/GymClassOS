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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CoachMessage = {
  body: string;
  sentAt: string;
};

type StudioUpdate = {
  id: string;
  title: string;
  body: string;
  postedAt: string;
};

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
  /**
   * MA2-01 additive list of upcoming bookings (MEM-05). When present and
   * non-empty, Home renders the full list; when absent/empty it falls back to
   * the singular `upcomingBooking` card above for back-compat.
   */
  upcomingBookings?: {
    bookingId: string;
    occurrenceId: string;
    startsAt: string;
    className: string | null;
  }[];
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
  /** Latest message from the coach, wired additively when the API provides it */
  latestCoachMessage?: CoachMessage | null;
  /** Studio-wide updates/notices, wired additively when the API provides them */
  studioUpdates?: StudioUpdate[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function relativeTimeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHrs < 1) return "Just now";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, error, refetch } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  // Refetch on tab focus so a booking made on Classes tab reflects here
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const s = useMemo(
    () => ({
      // ---- Containers
      container: { flex: 1, backgroundColor: theme.colors.background },
      center: {
        flex: 1,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.xl,
        gap: theme.spacing.lg,
      },
      scroll: { padding: theme.spacing.xl, paddingBottom: 96 },

      // ---- Greeting
      greeting: {
        color: theme.colors.foreground,
        fontSize: 32,
        fontFamily: theme.font.bold,
        marginBottom: 4,
      },
      subGreeting: {
        color: theme.colors.muted,
        fontSize: 14,
        fontFamily: theme.font.regular,
        marginBottom: theme.spacing.lg,
      },

      // ---- Cards (shared)
      card: {
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.md,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.md,
      },
      heroCard: {
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      sectionLabel: {
        color: theme.colors.muted,
        fontSize: 11,
        fontFamily: theme.font.semibold,
        textTransform: "uppercase" as const,
        letterSpacing: 0.8,
        marginBottom: theme.spacing.sm,
      },

      // ---- Pass Balance hero card
      passBalanceRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
      },
      passBalanceValue: {
        color: theme.colors.foreground,
        fontSize: 40,
        fontFamily: theme.font.bold,
        lineHeight: 44,
      },
      passBalanceValueDanger: {
        color: theme.colors.danger,
      },
      passBalanceUnit: {
        color: theme.colors.muted,
        fontSize: 16,
        fontFamily: theme.font.regular,
        marginTop: 4,
      },
      passBalanceIconWrap: {
        backgroundColor: theme.colors.accentSoft,
        borderRadius: theme.radius.lg,
        padding: 14,
      },
      passBalanceDangerBadge: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        backgroundColor: theme.colors.dangerSoft,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: "flex-start" as const,
        marginTop: theme.spacing.sm,
      },
      passBalanceDangerText: {
        color: theme.colors.foreground,
        fontSize: 12,
        fontFamily: theme.font.semibold,
      },
      topUpBtn: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        backgroundColor: theme.colors.accent,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 6,
        alignSelf: "flex-start" as const,
        marginTop: theme.spacing.sm,
      },
      topUpBtnText: {
        color: theme.colors.accentForeground,
        fontSize: 13,
        fontFamily: theme.font.semibold,
      },

      // ---- Next Class hero card
      bookingRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        paddingVertical: 4,
      },
      bookingTitle: {
        color: theme.colors.foreground,
        fontSize: 20,
        fontFamily: theme.font.semibold,
      },
      bookingTime: {
        color: theme.colors.muted,
        fontSize: 14,
        marginTop: 4,
        fontFamily: theme.font.regular,
      },
      bookingEmpty: {
        color: theme.colors.mutedFaint,
        fontSize: 14,
        fontFamily: theme.font.regular,
        marginTop: 4,
      },

      // ---- Coach message hero card
      coachHeaderRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        marginBottom: theme.spacing.sm,
      },
      coachIconWrap: {
        backgroundColor: theme.colors.accentSoft,
        borderRadius: theme.radius.sm,
        padding: 6,
      },
      coachCardTitle: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontFamily: theme.font.semibold,
        flex: 1,
      },
      coachMessageBody: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontFamily: theme.font.regular,
        lineHeight: 22,
      },
      coachMessageEmpty: {
        color: theme.colors.muted,
        fontSize: 14,
        fontFamily: theme.font.regular,
        lineHeight: 20,
      },
      coachMessageTime: {
        color: theme.colors.mutedFaint,
        fontSize: 12,
        fontFamily: theme.font.regular,
        marginTop: 8,
      },

      // ---- Studio updates section
      sectionHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        marginBottom: theme.spacing.sm,
        marginTop: theme.spacing.sm,
      },
      sectionTitle: {
        color: theme.colors.foreground,
        fontSize: 17,
        fontFamily: theme.font.semibold,
        flex: 1,
      },
      updateCard: {
        backgroundColor: theme.colors.card,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      updateTitle: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontFamily: theme.font.semibold,
        marginBottom: 4,
      },
      updateBody: {
        color: theme.colors.muted,
        fontSize: 13,
        fontFamily: theme.font.regular,
        lineHeight: 18,
      },
      updateTime: {
        color: theme.colors.mutedFaint,
        fontSize: 11,
        fontFamily: theme.font.regular,
        marginTop: 6,
      },
      updatesEmpty: {
        color: theme.colors.mutedFaint,
        fontSize: 14,
        fontFamily: theme.font.regular,
        paddingVertical: theme.spacing.sm,
      },

      // ---- Nutrition card
      macroLine: {
        color: theme.colors.foreground,
        fontSize: 16,
        textAlign: "center" as const,
        marginTop: theme.spacing.sm,
        fontVariant: ["tabular-nums" as const],
        fontFamily: theme.font.regular,
      },
      macroTargets: {
        color: theme.colors.mutedFaint,
        fontSize: 12,
        textAlign: "center" as const,
        marginTop: 4,
        fontFamily: theme.font.regular,
      },

      // ---- Shared
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
      error: {
        color: theme.colors.danger,
        fontFamily: theme.font.regular,
        textAlign: "center" as const,
      },
    }),
    [theme],
  );

  // ---- Loading / error states (crash-safe — /api/m/* may 401 on current deploy)
  if (isLoading && !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={s.center}>
        <Text style={s.error}>Couldn't load home</Text>
        <Pressable onPress={() => refetch()} style={s.btn}>
          <Text style={s.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const {
    member,
    passBalance,
    upcomingBooking,
    upcomingBookings,
    today,
    latestCoachMessage,
    studioUpdates,
  } = data;
  const lowBalance = passBalance <= 0;
  const fmt = (n: number) => Math.round(n);

  // MEM-05: prefer the additive list when the API provides it (cap at 5 rows);
  // otherwise fall back to the singular upcomingBooking card below.
  const bookingList = (upcomingBookings ?? []).slice(0, 5);
  const hasBookingList = bookingList.length > 0;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scroll}>
      {/* ── Greeting ──────────────────────────────────────────────── */}
      <Text style={s.greeting}>Hi {member.firstName}</Text>
      <Text style={s.subGreeting}>Here's your studio overview</Text>

      {/* ── Hero 1: Pass Balance ───────────────────────────────────── */}
      <View style={s.heroCard}>
        <Text style={s.sectionLabel}>Pass Balance</Text>
        <View style={s.passBalanceRow}>
          <View>
            <Text
              style={[
                s.passBalanceValue,
                lowBalance && s.passBalanceValueDanger,
              ]}
            >
              {passBalance}
            </Text>
            <Text style={s.passBalanceUnit}>
              {passBalance === 1 ? "credit" : "credits"}
            </Text>
          </View>
          <View style={s.passBalanceIconWrap}>
            <Feather
              name="award"
              size={28}
              color={lowBalance ? theme.colors.danger : theme.colors.accent}
            />
          </View>
        </View>
        {lowBalance ? (
          <View style={s.passBalanceDangerBadge}>
            <Feather
              name="alert-circle"
              size={12}
              color={theme.colors.foreground}
            />
            <Text style={s.passBalanceDangerText}>
              No credits — top up to book
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => router.push("/(tabs)/passes" as any)}
            style={s.topUpBtn}
          >
            <Feather
              name="plus"
              size={14}
              color={theme.colors.accentForeground}
            />
            <Text style={s.topUpBtnText}>View passes</Text>
          </Pressable>
        )}
      </View>

      {/* ── Hero 2: Upcoming Classes ───────────────────────────────── */}
      {/* MEM-05: render the additive upcomingBookings[] list when present;
          otherwise fall back to the singular upcomingBooking card. */}
      <View style={s.heroCard}>
        <Text style={s.sectionLabel}>
          {hasBookingList ? "Upcoming" : "Next class"}
        </Text>
        {hasBookingList ? (
          bookingList.map((b, i) => (
            <Pressable
              key={b.bookingId}
              onPress={() => router.push("/(tabs)/schedule")}
              style={[
                s.bookingRow,
                i > 0 && {
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  marginTop: theme.spacing.sm,
                  paddingTop: theme.spacing.sm,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.bookingTitle}>{b.className ?? "Class"}</Text>
                <Text style={s.bookingTime}>
                  {bookingTimeLabel(b.startsAt)}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={22}
                color={theme.colors.mutedFaint}
              />
            </Pressable>
          ))
        ) : upcomingBooking ? (
          <Pressable
            onPress={() => router.push("/(tabs)/schedule")}
            style={s.bookingRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.bookingTitle}>
                {upcomingBooking.className ?? "Class"}
              </Text>
              <Text style={s.bookingTime}>
                {bookingTimeLabel(upcomingBooking.startsAt)}
              </Text>
            </View>
            <Feather
              name="chevron-right"
              size={22}
              color={theme.colors.mutedFaint}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push("/(tabs)/schedule")}
            style={s.bookingRow}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.bookingTitle}>No upcoming class</Text>
              <Text style={s.bookingEmpty}>Tap to browse the schedule</Text>
            </View>
            <Feather
              name="chevron-right"
              size={22}
              color={theme.colors.mutedFaint}
            />
          </Pressable>
        )}
      </View>

      {/* ── Hero 3: Latest Coach Message ───────────────────────────── */}
      <View style={s.heroCard}>
        <View style={s.coachHeaderRow}>
          <View style={s.coachIconWrap}>
            <Feather
              name="message-circle"
              size={16}
              color={theme.colors.accent}
            />
          </View>
          <Text style={s.coachCardTitle}>From your coach</Text>
        </View>
        {latestCoachMessage ? (
          <>
            <Text style={s.coachMessageBody}>{latestCoachMessage.body}</Text>
            <Text style={s.coachMessageTime}>
              {relativeTimeLabel(latestCoachMessage.sentAt)}
            </Text>
          </>
        ) : (
          <Text style={s.coachMessageEmpty}>
            No new messages from your coach right now — check back after class.
          </Text>
        )}
      </View>

      {/* ── Studio Updates (coach-voice noticeboard) ──────────────── */}
      <View style={{ marginBottom: theme.spacing.sm }}>
        <View style={s.sectionHeader}>
          <Feather name="bell" size={18} color={theme.colors.muted} />
          <Text style={s.sectionTitle}>Studio updates</Text>
        </View>

        {studioUpdates && studioUpdates.length > 0 ? (
          studioUpdates.map((update) => (
            <View key={update.id} style={s.updateCard}>
              <Text style={s.updateTitle}>{update.title}</Text>
              <Text style={s.updateBody}>{update.body}</Text>
              <Text style={s.updateTime}>
                {relativeTimeLabel(update.postedAt)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={s.updatesEmpty}>No studio updates this week.</Text>
        )}
      </View>

      {/* ── Today's Nutrition ──────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.sectionLabel}>Today</Text>
        <View style={{ alignItems: "center", marginVertical: 16 }}>
          <KcalRing value={fmt(today.kcal)} target={today.targetKcal} />
        </View>
        <Text style={s.macroLine}>
          P {fmt(today.proteinG)}g{"  "}C {fmt(today.carbsG)}g{"  "}F{" "}
          {fmt(today.fatG)}g
        </Text>
        <Text style={s.macroTargets}>
          Target P {today.targetProteinG}g · C {today.targetCarbsG}g · F{" "}
          {today.targetFatG}g
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/food")}
          style={[s.btn, { marginTop: 16 }]}
        >
          <Text style={s.btnText}>+ Log a meal</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
