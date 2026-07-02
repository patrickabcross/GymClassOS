// Member self-check-in via QR scanner (DE6-03).
//
// Opens from the Schedule tab → "Scan to check in" (members only).
// Scans the kiosk QR (payload: `runstudio-checkin:<occurrenceId>`),
// ignores all other QR codes, then POSTs /api/m/checkin with the
// extracted occurrenceId. Shows success / error confirmation states.
import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { apiFetch } from "../lib/api";
import { useTheme } from "../lib/theme";

const QR_PREFIX = "runstudio-checkin:";

type CheckinResult = {
  attended: true;
  className: string | null;
  startsAt: string;
};

export default function CheckinScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [perm, requestPerm] = useCameraPermissions();

  // Self-guard: fire onBarcodeScanned at most once per valid QR.
  // Reset when the user wants to "Scan again" after an error.
  const doneRef = useRef(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        fill: { ...StyleSheet.absoluteFillObject },
        center: {
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 16,
        },
        overlay: {
          ...StyleSheet.absoluteFillObject,
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        },
        frame: {
          width: 280,
          height: 280,
          borderRadius: 16,
          borderWidth: 3,
          borderColor: theme.colors.foreground,
          backgroundColor: "transparent",
        },
        hint: {
          color: theme.colors.foreground,
          fontSize: 14,
          opacity: 0.9,
          textShadowColor: "rgba(0,0,0,0.7)",
          textShadowRadius: 4,
          textAlign: "center",
          paddingHorizontal: 24,
        },
        title: {
          color: theme.colors.foreground,
          fontSize: 22,
          fontFamily: theme.font.bold,
          textAlign: "center",
        },
        subtitle: {
          color: theme.colors.muted,
          fontSize: 15,
          fontFamily: theme.font.regular,
          textAlign: "center",
        },
        copy: {
          color: theme.colors.foreground,
          textAlign: "center",
          fontSize: 16,
          fontFamily: theme.font.regular,
        },
        btn: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: theme.radius.sm,
          alignItems: "center",
          minWidth: 160,
        },
        btnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.semibold,
          fontSize: 15,
        },
        btnSecondary: {
          backgroundColor: theme.colors.cardElevated,
          paddingHorizontal: 24,
          paddingVertical: 14,
          borderRadius: theme.radius.sm,
          alignItems: "center",
          minWidth: 160,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        btnSecondaryText: {
          color: theme.colors.foreground,
          fontFamily: theme.font.semibold,
          fontSize: 15,
        },
        successIcon: {
          marginBottom: 8,
        },
        classTime: {
          color: theme.colors.mutedFaint,
          fontSize: 14,
          fontFamily: theme.font.regular,
          textAlign: "center",
        },
      }),
    [theme],
  );

  const checkinMutation = useMutation<
    CheckinResult,
    Error,
    { occurrenceId: string }
  >({
    mutationFn: ({ occurrenceId }) =>
      apiFetch("/api/m/checkin", {
        method: "POST",
        body: JSON.stringify({ occurrenceId }),
      }) as Promise<CheckinResult>,
    onSuccess: () => {
      // Invalidate schedule + profile so the attended state reflects
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  function handleBarcode(data: string) {
    if (doneRef.current) return;
    // Ignore QR codes that don't carry the RunStudio check-in prefix — user
    // may scan a random QR before finding the kiosk QR.
    if (!data.startsWith(QR_PREFIX)) return;
    doneRef.current = true;
    const occurrenceId = data.slice(QR_PREFIX.length);
    checkinMutation.mutate({ occurrenceId });
  }

  function handleScanAgain() {
    doneRef.current = false;
    checkinMutation.reset();
  }

  // ── Permission not yet determined ─────────────────────────────────────
  if (!perm) return null;

  // ── Permission denied ─────────────────────────────────────────────────
  if (!perm.granted) {
    return (
      <View style={styles.center}>
        <Feather name="camera-off" size={40} color={theme.colors.mutedFaint} />
        <Text style={styles.copy}>
          Camera permission is required to scan the check-in QR.
        </Text>
        <Pressable onPress={requestPerm} style={styles.btn}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  // ── Submitting (spinning) ─────────────────────────────────────────────
  if (checkinMutation.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text style={styles.copy}>Checking you in…</Text>
      </View>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────
  if (checkinMutation.isSuccess) {
    const { className, startsAt } = checkinMutation.data;
    const timeStr = new Date(startsAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <View style={styles.center}>
        <Feather
          name="check-circle"
          size={56}
          color={theme.colors.success}
          style={styles.successIcon}
        />
        <Text style={styles.title}>
          Checked in to {className ?? "class"}
        </Text>
        <Text style={styles.classTime}>{timeStr}</Text>
        <Pressable onPress={() => router.back()} style={styles.btn}>
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  // ── Error states ──────────────────────────────────────────────────────
  if (checkinMutation.isError) {
    const msg = String(checkinMutation.error?.message ?? "");
    let headline = "Couldn’t check you in — please try again";
    let secondary: string | null = null;

    if (msg.includes("NOT_BOOKED")) {
      headline = "You’re not booked in this class";
      secondary = "Contact the studio if you think this is wrong.";
    } else if (msg.includes("CHECKIN_WINDOW_CLOSED")) {
      headline = "Check-in isn’t open for this class right now";
      secondary = "Scanning is available from 45 min before the class starts.";
    } else if (
      msg.includes("OCCURRENCE_NOT_FOUND") ||
      msg.includes("OCCURRENCE_UNAVAILABLE")
    ) {
      headline = "This class is no longer available";
    }

    const isRetryable =
      !msg.includes("NOT_BOOKED") && !msg.includes("CHECKIN_WINDOW_CLOSED");

    return (
      <View style={styles.center}>
        <Feather name="x-circle" size={48} color={theme.colors.danger} />
        <Text style={styles.title}>{headline}</Text>
        {secondary && <Text style={styles.subtitle}>{secondary}</Text>}
        {isRetryable ? (
          <Pressable onPress={handleScanAgain} style={styles.btn}>
            <Text style={styles.btnText}>Scan again</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.back()} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>Close</Text>
          </Pressable>
        )}
      </View>
    );
  }

  // ── Camera ready — scan ────────────────────────────────────────────────
  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          if (!result?.data) return;
          handleBarcode(result.data);
        }}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Point at the class QR to check in</Text>
      </View>
    </View>
  );
}
