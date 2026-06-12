// Profile tab — shows the picked member's name + pass balance + a purchase
// surface that lists studio products and opens Stripe Checkout in a browser
// sheet. Long-press switches demo persona (D-05).
//
// Purchase flow (P1c.1-06 / PAY-01):
//   1. On mount, GET /api/m/purchase → product list (label, description, mode)
//   2. Tap "Buy" → POST /api/m/purchase { priceId, mode } → { url }
//   3. expo-web-browser opens the Checkout URL in an in-app browser sheet
//   4. On sheet close, invalidate ['profile'] so pass balance refreshes
//
// No SVGs per D2-04 policy. Tabler/RN icon convention.
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { apiFetch } from "../../lib/api";
import { clearCurrentMemberId } from "../../lib/current-member";

interface Product {
  priceId: string;
  label: string;
  description: string;
  mode: "payment" | "subscription";
}

export default function ProfileScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch("/api/m/profile"),
  });

  const {
    data: productsData,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery<{ products: Product[] }>({
    queryKey: ["purchase-products"],
    queryFn: () => apiFetch("/api/m/purchase"),
    // Retry once — if the endpoint isn't configured (no connected account) it
    // returns 503; we'll show a graceful empty state rather than an error.
    retry: 1,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (product: Product) => {
      return apiFetch("/api/m/purchase", {
        method: "POST",
        body: JSON.stringify({ priceId: product.priceId, mode: product.mode }),
      }) as Promise<{ url: string }>;
    },
    onSuccess: async ({ url }) => {
      // Open Stripe Checkout in an in-app browser sheet (P1c.1-06 criterion #6)
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
      // After the sheet dismisses, refresh profile so pass balance updates
      // (the actual grant happens server-side via the webhook reducer — this is
      // best-effort / optimistic poll).
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (err) => {
      Alert.alert(
        "Purchase unavailable",
        err instanceof Error
          ? err.message
          : "Could not open checkout. Please try again.",
      );
    },
  });

  const [confirming, setConfirming] = useState(false);

  async function switchMember() {
    await clearCurrentMemberId();
    router.replace("/pick-member");
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  if (error || !data?.member) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#f88" }}>Couldn't load profile</Text>
        <Pressable onPress={switchMember} style={styles.btn}>
          <Text style={styles.btnText}>Switch member</Text>
        </Pressable>
      </View>
    );
  }

  const m = data.member;
  const products: Product[] = productsData?.products ?? [];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      <Pressable
        onLongPress={() => setConfirming(true)}
        delayLongPress={600}
        style={styles.header}
      >
        <Text style={styles.name}>
          {m.firstName} {m.lastName ?? ""}
        </Text>
        <Text style={styles.subtitle}>{m.email ?? m.phoneE164 ?? ""}</Text>
        <Text style={styles.hint}>Long-press anywhere to switch member (demo)</Text>
      </Pressable>

      {confirming && (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>Switch demo member?</Text>
          <View style={styles.confirmRow}>
            <Pressable
              onPress={() => setConfirming(false)}
              style={[styles.btn, styles.btnSecondary]}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={switchMember} style={styles.btn}>
              <Text style={styles.btnText}>Switch</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Pass balance summary */}
      {typeof data.passBalance === "number" && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Pass balance</Text>
          <Text style={styles.balanceValue}>{data.passBalance}</Text>
          <Text style={styles.balanceUnit}>credits remaining</Text>
        </View>
      )}

      {/* Purchase section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buy passes / membership</Text>

        {productsLoading && (
          <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
        )}

        {!productsLoading && productsError && (
          <Text style={styles.emptyText}>
            Purchasing is not available yet for this studio.
          </Text>
        )}

        {!productsLoading && !productsError && products.length === 0 && (
          <Text style={styles.emptyText}>
            No products configured yet. Check back soon.
          </Text>
        )}

        {products.map((product) => (
          <View key={product.priceId} style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productLabel}>{product.label}</Text>
              <Text style={styles.productDesc}>{product.description}</Text>
              {product.mode === "subscription" && (
                <Text style={styles.productTag}>Monthly</Text>
              )}
            </View>
            <Pressable
              style={[
                styles.buyBtn,
                purchaseMutation.isPending && styles.buyBtnDisabled,
              ]}
              onPress={() => purchaseMutation.mutate(product)}
              disabled={purchaseMutation.isPending}
            >
              {purchaseMutation.isPending &&
              purchaseMutation.variables?.priceId === product.priceId ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buyBtnText}>Buy</Text>
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#111" },
  container: { padding: 24, gap: 16, paddingBottom: 48 },
  header: { gap: 8 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    gap: 12,
  },
  name: { color: "#fff", fontSize: 28, fontWeight: "700", marginTop: 32 },
  subtitle: { color: "#999", fontSize: 16 },
  hint: { color: "#555", fontSize: 12, marginTop: 8 },

  btn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnSecondary: { backgroundColor: "#333" },
  btnText: { color: "#fff", fontWeight: "600" },

  confirmBox: {
    backgroundColor: "#1a1a1a",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 12,
  },
  confirmText: { color: "#fff" },
  confirmRow: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },

  balanceCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3b82f6",
    gap: 4,
  },
  balanceLabel: { color: "#9ca3af", fontSize: 13 },
  balanceValue: { color: "#3b82f6", fontSize: 40, fontWeight: "700" },
  balanceUnit: { color: "#6b7280", fontSize: 12 },

  section: { gap: 12 },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyText: { color: "#555", fontSize: 14 },

  productCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  productInfo: { flex: 1, gap: 4 },
  productLabel: { color: "#fff", fontSize: 16, fontWeight: "600" },
  productDesc: { color: "#9ca3af", fontSize: 13 },
  productTag: {
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  buyBtn: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
