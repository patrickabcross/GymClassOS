// Teacher assigned-schedule tab (TCH-01). Lists the signed-in teacher's
// upcoming assigned sessions (GET /api/m/teacher/schedule — trainer_id scoped,
// next 7d) grouped by day, each tappable to open its roster
// (router.push → /teacher-roster). Structure mirrors the member schedule tab
// (app/(tabs)/schedule.tsx) — FlatList + day grouping + theme styles — with the
// booking/pass logic stripped out.
//
// Empty states are COPY, never an error (MA3-02 success criterion 1):
//   • trainerLinked === false → "not linked to a trainer yet" (contact studio)
//   • linked but items empty   → "No sessions assigned to you this week."
// Genuine fetch failures still show a Retry view exactly like schedule.tsx.
import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme";

type Item = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string | null;
  room: string | null;
  location: string | null;
  className: string | null;
  category: string | null;
  durationMin: number | null;
};

type Section = { day: string; items: Item[] };

function dayKey(iso: string) {
  // Demo: UTC date bucket (mirrors schedule.tsx). Production uses studio IANA TZ.
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

export default function TeacherScheduleScreen() {
  const theme = useTheme();
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
        error: {
          color: theme.colors.danger,
          marginBottom: theme.spacing.lg,
          fontFamily: theme.font.regular,
        },
        emptyTitle: {
          color: theme.colors.foreground,
          fontSize: 16,
          fontFamily: theme.font.semibold,
          textAlign: "center",
          marginBottom: theme.spacing.sm,
        },
        emptyText: {
          color: theme.colors.mutedFaint,
          fontFamily: theme.font.regular,
          textAlign: "center",
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
    queryKey: ["teacher-schedule"],
    queryFn: () => apiFetch("/api/m/teacher/schedule"),
  });

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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }

  // Genuine fetch error → Retry (NOT the empty-state copy below).
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn&apos;t load your schedule</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Empty states are copy, never an error. Distinguish unlinked vs no-sessions
  // via trainerLinked (MA3-02 Pitfall 3).
  const items: Item[] = data?.items ?? [];
  if (items.length === 0) {
    const trainerLinked = data?.trainerLinked === true;
    return (
      <View style={styles.center}>
        <Feather
          name="calendar"
          size={36}
          color={theme.colors.mutedFaint}
          style={{ marginBottom: theme.spacing.md }}
        />
        {trainerLinked ? (
          <Text style={styles.emptyText}>
            No sessions assigned to you this week.
          </Text>
        ) : (
          <>
            <Text style={styles.emptyTitle}>You&apos;re not linked yet</Text>
            <Text style={styles.emptyText}>
              You&apos;re not linked to a trainer yet — contact the studio.
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.day}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionHeader}>
              {dayLabel(section.items[0].startsAt)}
            </Text>
            {section.items.map((it) => (
              <Pressable
                key={it.id}
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: "/teacher-roster",
                    params: {
                      occurrenceId: it.id,
                      title: it.className ?? "Class",
                    },
                  })
                }
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.time}>{timeLabel(it.startsAt)}</Text>
                    <Text style={styles.className}>
                      {it.className ?? "Class"}
                    </Text>
                    <Text style={styles.meta}>
                      Capacity {it.capacity}
                      {it.location ? ` · ${it.location}` : ""}
                      {it.room ? ` · ${it.room}` : ""}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={theme.colors.mutedFaint}
                  />
                </View>
              </Pressable>
            ))}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </View>
  );
}
