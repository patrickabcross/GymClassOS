import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

type Props = { onScanned: (ean: string) => void };

/**
 * Full-screen camera with EAN/UPC barcode detection.
 *
 * 3-state render (Pitfall #6):
 *   - permissions loading (perm === null) → null (parent decides loader UX)
 *   - denied (!perm.granted) → in-screen explanation + Grant button
 *   - granted → CameraView
 *
 * `onScanned` is invoked at most once — `onBarcodeScanned` fires many times
 * per second in expo-camera so we self-guard.
 */
export default function BarcodeScanner({ onScanned }: Props) {
  const [perm, requestPerm] = useCameraPermissions();
  const [done, setDone] = useState(false);

  if (!perm) return null;
  if (!perm.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>
          Camera permission is required to scan barcodes.
        </Text>
        <Pressable onPress={requestPerm} style={styles.btn}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"],
        }}
        onBarcodeScanned={(result) => {
          if (done) return;
          if (!result?.data) return;
          setDone(true);
          onScanned(result.data);
        }}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Centre the barcode in the frame</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  copy: { color: "#fff", textAlign: "center", fontSize: 16 },
  btn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontWeight: "600" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  frame: {
    width: 280,
    height: 140,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "transparent",
  },
  hint: {
    color: "#fff",
    fontSize: 14,
    opacity: 0.9,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 4,
  },
});
