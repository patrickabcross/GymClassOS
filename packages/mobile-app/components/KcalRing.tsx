import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  value: number;
  target: number;
  /** Diameter of the ring in px. Default 160. */
  size?: number;
  /** Width of the ring stroke in px. Default 14. */
  stroke?: number;
};

/**
 * Circular progress ring without react-native-svg.
 *
 * Implementation: two half-disc clipping rectangles are rotated to expose
 * a coloured progress arc on top of a grey background ring. Resolution is
 * 1° (good enough for demo grade).
 */
export default function KcalRing({
  value,
  target,
  size = 160,
  stroke = 14,
}: Props) {
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const deg = pct * 360;
  const inner = size - 2 * stroke;

  // Rotation strategy:
  // - Right half progress (0..180deg): rotate progress-right from -180 to 0
  // - Left half progress (180..360deg): rotate progress-left from 0 to 180
  const rightDeg = Math.min(180, deg);
  const leftDeg = Math.max(0, deg - 180);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Background ring */}
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: stroke,
            borderColor: "#2a2a2a",
          },
        ]}
      />
      {/* Right half progress */}
      <View
        style={[styles.half, { width: size, height: size }]}
        pointerEvents="none"
      >
        <View
          style={{
            position: "absolute",
            width: size / 2,
            height: size,
            left: size / 2,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              width: size,
              height: size,
              left: -size / 2,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: "#3b82f6",
              transform: [{ rotate: `${rightDeg - 180}deg` }],
            }}
          />
        </View>
      </View>
      {/* Left half progress */}
      {leftDeg > 0 && (
        <View
          style={[styles.half, { width: size, height: size }]}
          pointerEvents="none"
        >
          <View
            style={{
              position: "absolute",
              width: size / 2,
              height: size,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: stroke,
                borderColor: "#3b82f6",
                transform: [{ rotate: `${leftDeg}deg` }],
              }}
            />
          </View>
        </View>
      )}
      {/* Centre text */}
      <View
        style={{
          position: "absolute",
          width: inner,
          height: inner,
          left: stroke,
          top: stroke,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={styles.bigNum}>{value.toLocaleString("en-GB")}</Text>
        <Text style={styles.small}>
          / {target.toLocaleString("en-GB")} kcal
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  half: { position: "absolute", overflow: "hidden" },
  bigNum: { color: "#fff", fontSize: 32, fontWeight: "700" },
  small: { color: "#999", fontSize: 12, marginTop: 4 },
});
