import { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";
import { useTheme } from "../lib/theme";

type Result = {
  id: string;
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSizeG: string | null;
};

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export default function FoodAddScreen() {
  const router = useRouter();
  const theme = useTheme();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<Result | null>(null);
  const [mealType, setMealType] = useState<MealType>("snack");
  const [quantity, setQuantity] = useState("100");
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const { data, isLoading } = useQuery<{ results: Result[] }>({
    queryKey: ["food-search", debouncedQ],
    queryFn: () =>
      apiFetch(`/api/m/foods/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: debouncedQ.length >= 2,
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
          padding: 16,
        },
        searchRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: theme.colors.card,
          paddingHorizontal: 12,
          borderRadius: 10,
        },
        input: {
          flex: 1,
          color: theme.colors.foreground,
          paddingVertical: 12,
          fontSize: 16,
          fontFamily: theme.font.regular,
        },
        resultRow: {
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          gap: 12,
          borderRadius: 10,
        },
        resultName: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontFamily: theme.font.regular,
        },
        resultBrand: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          marginTop: 2,
          fontFamily: theme.font.regular,
        },
        resultKcal: {
          color: theme.colors.muted,
          fontSize: 13,
          fontFamily: theme.font.regular,
        },
        empty: {
          color: theme.colors.mutedFaint,
          padding: 16,
          fontFamily: theme.font.regular,
        },
        confirmCard: {
          backgroundColor: theme.colors.card,
          padding: 16,
          borderRadius: theme.radius.md,
          marginTop: 12,
          gap: 8,
        },
        confirmName: {
          color: theme.colors.foreground,
          fontSize: 18,
          fontFamily: theme.font.bold,
        },
        confirmBrand: {
          color: theme.colors.muted,
          fontSize: 14,
          fontFamily: theme.font.regular,
        },
        confirmKcal: {
          color: theme.colors.muted,
          fontSize: 13,
          marginBottom: 8,
          fontFamily: theme.font.regular,
        },
        label: {
          color: theme.colors.muted,
          fontSize: 12,
          marginTop: 12,
          fontFamily: theme.font.semibold,
        },
        qtyInput: {
          backgroundColor: theme.colors.cardElevated,
          color: theme.colors.foreground,
          padding: 12,
          borderRadius: theme.radius.sm,
          fontSize: 16,
          fontFamily: theme.font.regular,
        },
        mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
        mealPill: {
          backgroundColor: theme.colors.cardElevated,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: theme.radius.pill,
        },
        mealPillActive: { backgroundColor: theme.colors.accent },
        mealPillText: {
          color: theme.colors.muted,
          fontSize: 14,
          fontFamily: theme.font.regular,
        },
        mealPillTextActive: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.semibold,
        },
        logBtn: {
          backgroundColor: theme.colors.accent,
          padding: 14,
          borderRadius: theme.radius.sm,
          alignItems: "center",
          marginTop: 16,
        },
        logBtnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.bold,
          fontSize: 16,
        },
        error: {
          color: theme.colors.danger,
          marginTop: 8,
          fontFamily: theme.font.regular,
        },
        pickDifferent: {
          color: theme.colors.muted,
          fontFamily: theme.font.regular,
        },
      }),
    [theme],
  );

  async function logEntry() {
    if (!selected) return;
    setLogging(true);
    setError(null);
    const qtyG = Number(quantity);
    if (!Number.isFinite(qtyG) || qtyG <= 0) {
      setError("Quantity must be a positive number of grams");
      setLogging(false);
      return;
    }
    try {
      await apiFetch("/api/m/food-entries", {
        method: "POST",
        body: JSON.stringify({
          foodItem: {
            id: selected.id,
            name: selected.name,
            brand: selected.brand,
            kcalPer100g: selected.kcalPer100g,
            proteinPer100g: selected.proteinPer100g,
            carbsPer100g: selected.carbsPer100g,
            fatPer100g: selected.fatPer100g,
            source: "openfoodfacts",
          },
          quantityG: qtyG,
          mealType,
        }),
      });
      qc.invalidateQueries({ queryKey: ["food-entries"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLogging(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Feather name="search" size={18} color={theme.colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search foods (e.g. banana)"
          placeholderTextColor={theme.colors.mutedFaint}
          style={styles.input}
          autoFocus
        />
      </View>

      {selected ? (
        <View style={styles.confirmCard}>
          <Text style={styles.confirmName}>{selected.name}</Text>
          {selected.brand && (
            <Text style={styles.confirmBrand}>{selected.brand}</Text>
          )}
          <Text style={styles.confirmKcal}>
            {Math.round(selected.kcalPer100g)} kcal / 100g
          </Text>

          <Text style={styles.label}>Quantity (g)</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            style={styles.qtyInput}
          />

          <Text style={styles.label}>Meal</Text>
          <View style={styles.mealRow}>
            {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map(
              (m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.mealPill,
                    mealType === m && styles.mealPillActive,
                  ]}
                  onPress={() => setMealType(m)}
                >
                  <Text
                    style={[
                      styles.mealPillText,
                      mealType === m && styles.mealPillTextActive,
                    ]}
                  >
                    {m[0].toUpperCase() + m.slice(1)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={logEntry}
            disabled={logging}
            style={[styles.logBtn, logging && { opacity: 0.6 }]}
          >
            <Text style={styles.logBtnText}>
              {logging ? "Logging…" : "Log entry"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSelected(null)}
            style={{ alignSelf: "center", padding: 12 }}
          >
            <Text style={styles.pickDifferent}>Pick a different food</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {isLoading && debouncedQ && (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          )}
          <FlatList
            data={data?.results ?? []}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.resultRow}
                onPress={() => setSelected(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  {item.brand && (
                    <Text style={styles.resultBrand}>{item.brand}</Text>
                  )}
                </View>
                <Text style={styles.resultKcal}>
                  {Math.round(item.kcalPer100g)} kcal/100g
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              debouncedQ.length >= 2 && !isLoading ? (
                <Text style={styles.empty}>No matches in Open Food Facts</Text>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}
