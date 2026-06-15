// Food AI estimate screen — photo + text → calorie & macro estimate → log.
// Structured tool screen (NOT an agent composer surface).
// Mirrors styling/structure of food-barcode.tsx and food-add.tsx exactly.
import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";
import { useTheme } from "../lib/theme";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type Estimate = {
  foodName: string;
  kcalPer100g: number;
  proteinPer100gG: number;
  carbsPer100gG: number;
  fatPer100gG: number;
  suggestedQuantityG: number;
  confidence: "low" | "medium" | "high";
  note: string;
};

type Mode = "input" | "estimating" | "result";

export default function FoodAiScreen() {
  const router = useRouter();
  const theme = useTheme();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("input");
  const [description, setDescription] = useState("");
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [perm, requestPerm] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const hasInput = description.trim().length > 0 || photoBase64 !== null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        scroll: { padding: 20, paddingBottom: 48 },
        sectionLabel: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.semibold,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
        },
        descInput: {
          backgroundColor: theme.colors.card,
          color: theme.colors.foreground,
          padding: 14,
          borderRadius: theme.radius.md,
          fontSize: 16,
          fontFamily: theme.font.regular,
          minHeight: 80,
          textAlignVertical: "top",
          marginBottom: 16,
        },
        cameraPermBox: {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          padding: 16,
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        },
        cameraBox: {
          height: 240,
          borderRadius: theme.radius.md,
          overflow: "hidden",
          marginBottom: 16,
          position: "relative",
        },
        photoAttachedRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          padding: 14,
          marginBottom: 16,
        },
        photoAttachedText: {
          color: theme.colors.foreground,
          fontFamily: theme.font.regular,
          flex: 1,
        },
        cameraBtn: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          padding: 14,
          marginBottom: 16,
        },
        cameraBtnText: {
          color: theme.colors.foreground,
          fontFamily: theme.font.regular,
          fontSize: 15,
        },
        captureBtn: {
          position: "absolute",
          bottom: 16,
          alignSelf: "center",
          backgroundColor: theme.colors.foreground,
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: "center",
          justifyContent: "center",
        },
        estimateBtn: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: theme.colors.accent,
          padding: 16,
          borderRadius: theme.radius.sm,
          marginTop: 8,
        },
        estimateBtnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.bold,
          fontSize: 16,
        },
        errorText: {
          color: theme.colors.danger,
          fontFamily: theme.font.regular,
          marginTop: 8,
          fontSize: 14,
        },
        // Result card
        resultCard: {
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius.md,
          padding: 16,
          gap: 6,
          marginBottom: 16,
        },
        resultName: {
          color: theme.colors.foreground,
          fontSize: 22,
          fontFamily: theme.font.bold,
        },
        resultKcal: {
          color: theme.colors.muted,
          fontSize: 14,
          fontFamily: theme.font.regular,
        },
        confidenceBadge: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          fontFamily: theme.font.regular,
          marginTop: 2,
        },
        resultNote: {
          color: theme.colors.mutedFaint,
          fontSize: 12,
          fontFamily: theme.font.regular,
          marginTop: 4,
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
        restartBtn: {
          alignSelf: "center",
          padding: 12,
          marginTop: 4,
        },
        restartBtnText: {
          color: theme.colors.muted,
          fontFamily: theme.font.regular,
        },
        muted: {
          color: theme.colors.muted,
          fontFamily: theme.font.regular,
        },
      }),
    [theme],
  );

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.4,
        imageType: "jpg",
      });
      if (photo?.base64) {
        setPhotoBase64(`data:image/jpeg;base64,${photo.base64}`);
        setShowCamera(false);
      }
    } catch {
      // If capture fails, stay in camera view
    }
  }

  async function handleEstimate() {
    setEstimateError(null);
    setMode("estimating");
    try {
      const body: Record<string, string> = {};
      if (photoBase64) body.image = photoBase64;
      if (description.trim()) body.description = description.trim();
      body.mealHint = mealType;

      const res = await apiFetch("/api/m/foods/analyze", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setEstimateError(res.error ?? "Estimate failed");
        setMode("input");
        return;
      }

      setEstimate(res.estimate as Estimate);
      setQuantity(String(Math.round(res.estimate.suggestedQuantityG || 100)));
      setMode("result");
    } catch (e: any) {
      setEstimateError(String(e?.message ?? e));
      setMode("input");
    }
  }

  async function handleLog() {
    if (!estimate) return;
    setLogError(null);
    const qtyG = Number(quantity);
    if (!Number.isFinite(qtyG) || qtyG <= 0) {
      setLogError("Quantity must be a positive number of grams");
      return;
    }
    setLogging(true);
    try {
      await apiFetch("/api/m/food-entries", {
        method: "POST",
        body: JSON.stringify({
          foodItem: {
            name: estimate.foodName,
            kcalPer100g: estimate.kcalPer100g,
            proteinPer100g: estimate.proteinPer100gG,
            carbsPer100g: estimate.carbsPer100gG,
            fatPer100g: estimate.fatPer100gG,
            source: "llm_estimate",
          },
          entrySource: "agent",
          quantityG: qtyG,
          mealType,
        }),
      });
      qc.invalidateQueries({ queryKey: ["food-entries"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      router.back();
    } catch (e: any) {
      setLogError(String(e?.message ?? e));
    } finally {
      setLogging(false);
    }
  }

  function handleStartOver() {
    setMode("input");
    setEstimate(null);
    setEstimateError(null);
    setLogError(null);
    setPhotoBase64(null);
    setDescription("");
  }

  // Camera view — overlays full screen while taking a photo
  if (showCamera) {
    if (!perm) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      );
    }
    if (!perm.granted) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              textAlign: "center",
              fontSize: 16,
              fontFamily: theme.font.regular,
            }}
          >
            Camera permission is required to take a food photo.
          </Text>
          <Pressable
            onPress={requestPerm}
            style={{
              backgroundColor: theme.colors.accent,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: theme.radius.sm,
            }}
          >
            <Text
              style={{
                color: theme.colors.accentForeground,
                fontFamily: theme.font.bold,
              }}
            >
              Grant permission
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          facing="back"
        />
        <Pressable style={styles.captureBtn} onPress={handleCapture}>
          <Feather name="camera" size={28} color={theme.colors.background} />
        </Pressable>
        <Pressable
          onPress={() => setShowCamera(false)}
          style={{ position: "absolute", top: 48, left: 24, padding: 8 }}
        >
          <Feather name="x" size={24} color={theme.colors.foreground} />
        </Pressable>
      </View>
    );
  }

  // Estimating spinner
  if (mode === "estimating") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.muted,
            fontFamily: theme.font.regular,
            fontSize: 16,
          }}
        >
          Estimating…
        </Text>
      </View>
    );
  }

  // Result mode
  if (mode === "result" && estimate) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.resultCard}>
          <Text style={styles.resultName}>{estimate.foodName}</Text>
          <Text style={styles.resultKcal}>
            {Math.round(estimate.kcalPer100g)} kcal / 100g
          </Text>
          <Text style={styles.confidenceBadge}>
            AI estimate · {estimate.confidence} confidence
          </Text>
          {estimate.note ? (
            <Text style={styles.resultNote}>{estimate.note}</Text>
          ) : null}
        </View>

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

        {logError && <Text style={styles.errorText}>{logError}</Text>}

        <Pressable
          onPress={handleLog}
          disabled={logging}
          style={[styles.logBtn, logging && { opacity: 0.6 }]}
        >
          <Text style={styles.logBtnText}>
            {logging ? "Logging…" : "Log entry"}
          </Text>
        </Pressable>

        <Pressable onPress={handleStartOver} style={styles.restartBtn}>
          <Text style={styles.restartBtnText}>Start over</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // Input mode (default)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionLabel}>Describe your meal</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. chicken caesar salad"
        placeholderTextColor={theme.colors.mutedFaint}
        style={styles.descInput}
        multiline
        numberOfLines={3}
        autoFocus
      />

      <Text style={styles.sectionLabel}>Photo (optional)</Text>
      {photoBase64 ? (
        <View style={styles.photoAttachedRow}>
          <Feather name="check-circle" size={18} color={theme.colors.accent} />
          <Text style={styles.photoAttachedText}>Photo attached</Text>
          <Pressable onPress={() => setPhotoBase64(null)}>
            <Text style={[styles.muted, { fontSize: 13 }]}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.cameraBtn} onPress={() => setShowCamera(true)}>
          <Feather name="camera" size={20} color={theme.colors.foreground} />
          <Text style={styles.cameraBtnText}>Take photo</Text>
        </Pressable>
      )}

      {estimateError && <Text style={styles.errorText}>{estimateError}</Text>}

      <Pressable
        style={[styles.estimateBtn, !hasInput && { opacity: 0.4 }]}
        onPress={hasInput ? handleEstimate : undefined}
        disabled={!hasInput}
      >
        <Feather name="zap" size={18} color={theme.colors.accentForeground} />
        <Text style={styles.estimateBtnText}>Estimate</Text>
      </Pressable>
    </ScrollView>
  );
}
