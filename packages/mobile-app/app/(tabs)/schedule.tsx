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
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["schedule"],
    queryFn: () => apiFetch("/api/m/schedule"),
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

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  const bookMutation = useMutation({
    mutationFn: async (occurrenceId: string) => {
      return apiFetch("/api/m/bookings", {
        method: "POST",
        body: JSON.stringify({ occurrenceId }),
      });
    },
    onMutate: async (occurrenceId: string) => {
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
    onError: (err: any, _occurrenceId, ctx) => {
      // Rollback
      if (ctx?.previous) qc.setQueryData(["schedule"], ctx.previous);
      setBookError(String(err?.message ?? err));
      setTimeout(() => setBookError(null), 4000);
    },
    onSuccess: () => {
      // Refresh profile so the Home tab's upcomingBooking updates
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Couldn't load schedule</Text>
        <Pressable onPress={() => refetch()} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
                        <Feather name="check" size={14} color="#fff" />
                        <Text style={styles.bookedBadgeText}>Booked</Text>
                      </View>
                    ) : (
                      <Feather
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#666"
                      />
                    )}
                  </Pressable>
                  {expanded && !it.isBookedByMe && (
                    <View style={styles.expandRow}>
                      {it.full ? (
                        <Text style={styles.fullText}>This class is full</Text>
                      ) : (
                        <Pressable
                          style={[
                            styles.btn,
                            bookMutation.isPending && { opacity: 0.6 },
                          ]}
                          disabled={bookMutation.isPending}
                          onPress={() => bookMutation.mutate(it.id)}
                        >
                          <Text style={styles.btnText}>Confirm booking</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sectionHeader: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  time: { color: "#999", fontSize: 12 },
  className: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 2 },
  meta: { color: "#666", fontSize: 12, marginTop: 2 },
  bookedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#16a34a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  bookedBadgeText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  expandRow: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4 },
  fullText: { color: "#f88", fontSize: 13 },
  btn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "600" },
  toast: {
    backgroundColor: "#7f1d1d",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  toastText: { color: "#fff", fontSize: 13 },
  error: { color: "#f88", marginBottom: 16 },
  emptyText: { color: "#666", marginTop: 32 },
});
