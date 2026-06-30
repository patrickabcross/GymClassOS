// ProductPickerSheet — MA2-03 (MEM-04).
//
// Presentational bottom-sheet for the no-pass purchase flow. The schedule
// screen owns all data + side effects (fetching products, POST /api/m/purchase,
// opening Stripe Checkout, polling for the grant, re-booking); this component
// only renders the choices and reports a selection. It does NOT fetch.
//
// Products come from GET /api/m/purchase (drop-in + 5-pack + 10-pack). The
// drop-in entry is default-highlighted. Feather icons only (mobile convention).
import { useMemo } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../lib/theme";

export type PurchaseProduct = {
  priceId: string;
  label: string;
  description: string;
  mode: "payment" | "subscription";
};

type Props = {
  visible: boolean;
  products: PurchaseProduct[];
  onSelect: (product: PurchaseProduct) => void;
  onClose: () => void;
};

// The drop-in single-class option is highlighted by default (cheapest entry,
// the most common no-pass purchase). Matched on label/description keyword.
function isDropIn(product: PurchaseProduct): boolean {
  const haystack = `${product.label} ${product.description}`.toLowerCase();
  return haystack.includes("drop-in") || haystack.includes("drop in");
}

export function ProductPickerSheet({
  visible,
  products,
  onSelect,
  onClose,
}: Props) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: "flex-end",
        },
        sheet: {
          backgroundColor: theme.colors.card,
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: theme.spacing.xs,
        },
        title: {
          color: theme.colors.foreground,
          fontSize: 18,
          fontFamily: theme.font.bold,
        },
        subtitle: {
          color: theme.colors.muted,
          fontSize: 13,
          fontFamily: theme.font.regular,
          marginBottom: theme.spacing.lg,
        },
        closeBtn: {
          padding: 4,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: theme.colors.cardElevated,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: 14,
          paddingVertical: 14,
          marginBottom: theme.spacing.sm,
        },
        rowHighlight: {
          borderColor: theme.colors.accent,
        },
        rowBody: {
          flex: 1,
        },
        rowLabel: {
          color: theme.colors.foreground,
          fontSize: 15,
          fontFamily: theme.font.semibold,
        },
        rowDescription: {
          color: theme.colors.muted,
          fontSize: 12,
          fontFamily: theme.font.regular,
          marginTop: 2,
        },
        emptyText: {
          color: theme.colors.mutedFaint,
          fontSize: 13,
          fontFamily: theme.font.regular,
          paddingVertical: theme.spacing.lg,
          textAlign: "center",
        },
      }),
    [theme],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable stops backdrop taps from closing when the sheet
            itself is pressed. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Choose a pass</Text>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={22} color={theme.colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Pick a pass to book this class. Packs save you money.
          </Text>

          {products.length === 0 ? (
            <Text style={styles.emptyText}>No passes available right now.</Text>
          ) : (
            products.map((product) => {
              const highlight = isDropIn(product);
              return (
                <Pressable
                  key={product.priceId}
                  style={[styles.row, highlight && styles.rowHighlight]}
                  onPress={() => onSelect(product)}
                >
                  <Feather
                    name={highlight ? "zap" : "credit-card"}
                    size={18}
                    color={highlight ? theme.colors.accent : theme.colors.muted}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowLabel}>{product.label}</Text>
                    <Text style={styles.rowDescription}>
                      {product.description}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={theme.colors.mutedFaint}
                  />
                </Pressable>
              );
            })
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
