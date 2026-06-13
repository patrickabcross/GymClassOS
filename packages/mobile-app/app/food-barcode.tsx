import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import BarcodeScanner from "../components/BarcodeScanner";
import { apiFetch } from "../lib/api";
import { useTheme } from "../lib/theme";

type Lookup =
  | { status: "scanning" }
  | { status: "loading"; ean: string }
  | { status: "found"; ean: string; item: any }
  | { status: "notfound"; ean: string }
  | { status: "error"; ean: string; message: string };

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export default function FoodBarcodeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const qc = useQueryClient();
  const [state, setState] = useState<Lookup>({ status: "scanning" });
  const [mealType, setMealType] = useState<MealType>("snack");
  const [logging, setLogging] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: {
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 12,
        },
        copy: {
          color: theme.colors.foreground,
          textAlign: "center",
          fontSize: 16,
          fontFamily: theme.font.regular,
        },
        sub: {
          color: theme.colors.muted,
          textAlign: "center",
          fontFamily: theme.font.regular,
        },
        btn: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: theme.radius.sm,
        },
        btnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.bold,
          fontSize: 16,
        },
        foundContainer: {
          flex: 1,
          backgroundColor: theme.colors.background,
          padding: 24,
          gap: 12,
        },
        foundName: {
          color: theme.colors.foreground,
          fontSize: 24,
          fontFamily: theme.font.bold,
        },
        foundBrand: {
          color: theme.colors.muted,
          fontSize: 16,
          fontFamily: theme.font.regular,
        },
        foundKcal: {
          color: theme.colors.muted,
          fontSize: 14,
          fontFamily: theme.font.regular,
        },
        warn: {
          color: theme.colors.warning,
          fontSize: 13,
          fontFamily: theme.font.regular,
        },
        label: {
          color: theme.colors.muted,
          fontSize: 12,
          marginTop: 12,
          fontFamily: theme.font.semibold,
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
        scanDifferent: {
          color: theme.colors.muted,
          fontFamily: theme.font.regular,
        },
      }),
    [theme],
  );

  async function onEan(ean: string) {
    setState({ status: "loading", ean });
    try {
      const res = await apiFetch(
        `/api/m/foods/barcode/${encodeURIComponent(ean)}`,
      );
      if (res?.found) {
        setState({ status: "found", ean, item: res.item });
      } else {
        setState({ status: "notfound", ean });
      }
    } catch (e: any) {
      setState({ status: "error", ean, message: String(e?.message ?? e) });
    }
  }

  async function logEntry() {
    if (state.status !== "found") return;
    setLogging(true);
    try {
      await apiFetch("/api/m/food-entries", {
        method: "POST",
        body: JSON.stringify({
          foodItem: {
            id: state.item.id,
            name: state.item.name,
            brand: state.item.brand,
            barcode: state.ean,
            kcalPer100g: state.item.kcalPer100g,
            proteinPer100g: state.item.proteinPer100g,
            carbsPer100g: state.item.carbsPer100g,
            fatPer100g: state.item.fatPer100g,
            source: "openfoodfacts",
          },
          quantityG: 100,
          mealType,
        }),
      });
      qc.invalidateQueries({ queryKey: ["food-entries"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } finally {
      setLogging(false);
    }
  }

  if (state.status === "scanning") {
    return <BarcodeScanner onScanned={onEan} />;
  }

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.copy}>Looking up {state.ean}…</Text>
      </View>
    );
  }

  if (state.status === "notfound" || state.status === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>
          {state.status === "notfound"
            ? "Couldn't find that barcode in Open Food Facts."
            : `Error: ${state.message}`}
        </Text>
        <Text style={styles.sub}>
          Try a different product or search by name.
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => setState({ status: "scanning" })}
        >
          <Text style={styles.btnText}>Scan again</Text>
        </Pressable>
      </View>
    );
  }

  const item = state.item;
  const hasNutrition = (item.kcalPer100g ?? 0) > 0;
  return (
    <View style={styles.foundContainer}>
      <Text style={styles.foundName}>{item.name}</Text>
      {item.brand && <Text style={styles.foundBrand}>{item.brand}</Text>}
      {hasNutrition ? (
        <Text style={styles.foundKcal}>
          {Math.round(item.kcalPer100g)} kcal / 100g
        </Text>
      ) : (
        <Text style={styles.warn}>
          Open Food Facts has this product but no nutrition values — logging
          will record 0 kcal.
        </Text>
      )}

      <Text style={styles.label}>Meal</Text>
      <View style={styles.mealRow}>
        {(["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.mealPill, mealType === m && styles.mealPillActive]}
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
        ))}
      </View>

      <Pressable
        onPress={logEntry}
        disabled={logging}
        style={[styles.btn, logging && { opacity: 0.6 }]}
      >
        <Text style={styles.btnText}>{logging ? "Logging…" : "Log 100g"}</Text>
      </Pressable>
      <Pressable
        onPress={() => setState({ status: "scanning" })}
        style={{ alignSelf: "center", padding: 12 }}
      >
        <Text style={styles.scanDifferent}>Scan a different barcode</Text>
      </Pressable>
    </View>
  );
}
