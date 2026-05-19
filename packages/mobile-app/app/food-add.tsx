import { useState, useEffect } from "react";
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
        <Feather name="search" size={18} color="#999" />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search foods (e.g. banana)"
          placeholderTextColor="#666"
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
            <Text style={{ color: "#999" }}>Pick a different food</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {isLoading && debouncedQ && (
            <View style={{ padding: 16 }}>
              <ActivityIndicator color="#fff" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111", padding: 16 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  input: { flex: 1, color: "#fff", paddingVertical: 12, fontSize: 16 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderRadius: 10,
  },
  resultName: { color: "#fff", fontSize: 15 },
  resultBrand: { color: "#777", fontSize: 12, marginTop: 2 },
  resultKcal: { color: "#999", fontSize: 13 },
  empty: { color: "#666", padding: 16 },
  confirmCard: {
    backgroundColor: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  confirmName: { color: "#fff", fontSize: 18, fontWeight: "700" },
  confirmBrand: { color: "#999", fontSize: 14 },
  confirmKcal: { color: "#999", fontSize: 13, marginBottom: 8 },
  label: { color: "#999", fontSize: 12, marginTop: 12, fontWeight: "600" },
  qtyInput: {
    backgroundColor: "#252525",
    color: "#fff",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealPill: {
    backgroundColor: "#252525",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  mealPillActive: { backgroundColor: "#3b82f6" },
  mealPillText: { color: "#999", fontSize: 14 },
  mealPillTextActive: { color: "#fff", fontWeight: "600" },
  logBtn: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  logBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#f88", marginTop: 8 },
});
