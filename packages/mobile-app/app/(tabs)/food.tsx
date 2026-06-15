import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../../lib/api";
import { useTheme } from "../../lib/theme";

type Entry = {
  id: string;
  loggedAt: string;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  quantityG: number;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  foodName: string | null;
  foodBrand: string | null;
};

const MEAL_LABELS: Record<Entry["mealType"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};
const MEAL_ORDER: Entry["mealType"][] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FoodScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [addOpen, setAddOpen] = useState(false);
  const dateKey = todayStr();

  const entriesQ = useQuery<{ entries: Entry[]; date: string }>({
    queryKey: ["food-entries", dateKey],
    queryFn: () => apiFetch(`/api/m/food-entries?date=${dateKey}`),
  });

  const profileQ = useQuery<any>({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  useFocusEffect(
    useCallback(() => {
      entriesQ.refetch();
      profileQ.refetch();
    }, [entriesQ, profileQ]),
  );

  const grouped = useMemo(() => {
    const out: Record<Entry["mealType"], Entry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const e of entriesQ.data?.entries ?? []) {
      out[e.mealType].push(e);
    }
    return out;
  }, [entriesQ.data]);

  const totals = useMemo(() => {
    let k = 0,
      p = 0,
      c = 0,
      f = 0;
    for (const e of entriesQ.data?.entries ?? []) {
      k += e.kcal ?? 0;
      p += e.proteinG ?? 0;
      c += e.carbsG ?? 0;
      f += e.fatG ?? 0;
    }
    return { kcal: k, proteinG: p, carbsG: c, fatG: f };
  }, [entriesQ.data]);

  const target = profileQ.data?.today ?? {
    targetKcal: 2100,
    targetProteinG: 130,
    targetCarbsG: 250,
    targetFatG: 60,
  };
  const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        center: {
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        },
        heading: {
          color: theme.colors.foreground,
          fontSize: 32,
          fontFamily: theme.font.bold,
        },
        kcalTotal: {
          color: theme.colors.foreground,
          fontSize: 24,
          fontFamily: theme.font.semibold,
          marginTop: 8,
          fontVariant: ["tabular-nums"],
        },
        macroLine: {
          color: theme.colors.muted,
          fontSize: 14,
          marginTop: 4,
          fontVariant: ["tabular-nums"],
          fontFamily: theme.font.regular,
        },
        section: { marginTop: 24 },
        sectionHeader: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.semibold,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
        },
        row: {
          backgroundColor: theme.colors.card,
          padding: 12,
          borderRadius: 10,
          marginBottom: 6,
        },
        foodName: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontFamily: theme.font.regular,
        },
        foodMeta: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          marginTop: 2,
          fontFamily: theme.font.regular,
        },
        emptyRow: {
          color: theme.colors.mutedFaint,
          fontSize: 13,
          paddingHorizontal: 4,
          fontFamily: theme.font.regular,
        },
        fab: {
          position: "absolute",
          bottom: 96,
          right: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 18,
          paddingVertical: 14,
          borderRadius: theme.radius.pill,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 6,
        },
        fabText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.bold,
          fontSize: 16,
        },
        backdrop: {
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: "flex-end",
        },
        sheet: {
          backgroundColor: theme.colors.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 16,
          paddingBottom: 32,
          gap: 12,
        },
        handle: {
          alignSelf: "center",
          width: 36,
          height: 4,
          borderRadius: 2,
          backgroundColor: theme.colors.border,
          marginBottom: 8,
        },
        sheetTitle: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.semibold,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        },
        addOption: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: theme.colors.cardElevated,
          padding: 16,
          borderRadius: theme.radius.md,
        },
        addOptionText: {
          color: theme.colors.foreground,
          fontSize: 16,
          fontFamily: theme.font.semibold,
        },
      }),
    [theme],
  );

  if (entriesQ.isLoading && !entriesQ.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }}>
        <Text style={styles.heading}>Today</Text>
        <Text style={styles.kcalTotal}>
          {fmt(totals.kcal)} / {fmt(target.targetKcal)} kcal
        </Text>
        <Text style={styles.macroLine}>
          P {fmt(totals.proteinG)}g{"  "}C {fmt(totals.carbsG)}g{"  "}F{" "}
          {fmt(totals.fatG)}g
        </Text>

        {MEAL_ORDER.map((m) => (
          <View key={m} style={styles.section}>
            <Text style={styles.sectionHeader}>{MEAL_LABELS[m]}</Text>
            {grouped[m].length === 0 ? (
              <Text style={styles.emptyRow}>Nothing logged</Text>
            ) : (
              grouped[m].map((e) => (
                <View key={e.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foodName}>
                      {e.foodName ?? "Unknown"}
                    </Text>
                    <Text style={styles.foodMeta}>
                      {Math.round(e.quantityG)}g · {Math.round(e.kcal)} kcal
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setAddOpen(true)}>
        <Feather name="plus" size={20} color={theme.colors.accentForeground} />
        <Text style={styles.fabText}>Add</Text>
      </Pressable>

      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Add food</Text>
            <Pressable
              style={styles.addOption}
              onPress={() => {
                setAddOpen(false);
                router.push("/food-add");
              }}
            >
              <Feather
                name="search"
                size={20}
                color={theme.colors.foreground}
              />
              <Text style={styles.addOptionText}>Search</Text>
            </Pressable>
            <Pressable
              style={styles.addOption}
              onPress={() => {
                setAddOpen(false);
                router.push("/food-barcode");
              }}
            >
              <Feather
                name="camera"
                size={20}
                color={theme.colors.foreground}
              />
              <Text style={styles.addOptionText}>Scan barcode</Text>
            </Pressable>
            <Pressable
              style={styles.addOption}
              onPress={() => {
                setAddOpen(false);
                router.push("/food-ai");
              }}
            >
              <Feather name="zap" size={20} color={theme.colors.foreground} />
              <Text style={styles.addOptionText}>AI estimate</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
