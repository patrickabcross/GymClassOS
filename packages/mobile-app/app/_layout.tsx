// GymOS member-app root layout. Wraps the entire app in:
//   1. QueryProvider (TanStack Query — every screen uses it).
//   2. GestureRoot (gesture-handler root view — required by @gorhom/bottom-sheet
//      used by the agent FAB in D2-06).
//   3. AuthGate — reads demoMemberId from AsyncStorage and redirects to
//      /pick-member if no member is selected (D-05). Inverse redirect: if a
//      member IS selected and we're on /pick-member, jump straight to (tabs).
//
// Replaced in P1a (MEMAUTH-02 magic-link) with a Better-auth session check.
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { QueryProvider } from "../lib/query-client";
import { getCurrentMemberId } from "../lib/current-member";
import { GestureRoot, AgentSheetContainer } from "../lib/bottom-sheet-impl";
import AgentSheet from "../components/AgentSheet";

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getCurrentMemberId();
      if (cancelled) return;
      const onPicker = segments[0] === "pick-member";
      if (!id && !onPicker) router.replace("/pick-member");
      if (id && onPicker) router.replace("/(tabs)");
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [segments]);

  if (!checked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#111",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color="#fff" />
      </View>
    );
  }
  return <>{children}</>;
}

// Persistent FAB + agent bottom-sheet — visible on every screen behind the
// AuthGate (so it never shows on /pick-member). Tapping the FAB opens the
// gorhom bottom-sheet (from D2-01 spike) with AgentSheet (from D2-06 Task 2)
// rendered inside. AGENT-01 (chat sheet) + AGENT-02 (3 tools) + AGENT-03
// (streaming) are wired through the AgentSheet → streamAgent → SSE path.
function AgentFabAndSheet() {
  const segments = useSegments();
  const [open, setOpen] = useState(false);

  // Hide FAB on the picker screen (no member yet → no agent context).
  const onPicker = segments[0] === "pick-member";
  if (onPicker) return null;

  return (
    <>
      <View pointerEvents="box-none" style={fabStyles.fabHost}>
        <Pressable
          style={fabStyles.fab}
          onPress={() => setOpen(true)}
          hitSlop={8}
        >
          <Feather name="message-circle" size={24} color="#fff" />
        </Pressable>
      </View>
      <AgentSheetContainer open={open} onClose={() => setOpen(false)}>
        {open && <AgentSheet onClose={() => setOpen(false)} />}
      </AgentSheetContainer>
    </>
  );
}

const fabStyles = StyleSheet.create({
  fabHost: {
    position: "absolute",
    right: 18,
    bottom: 92, // above tab bar (default Expo tab bar ~83 + 9 spacing)
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});

export default function RootLayout() {
  return (
    <QueryProvider>
      <GestureRoot>
        <StatusBar style="light" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: "#111111" },
              headerTintColor: "#ffffff",
              headerTitleStyle: { fontWeight: "600" },
              contentStyle: { backgroundColor: "#111111" },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="pick-member" options={{ headerShown: false }} />
            <Stack.Screen
              name="food-add"
              options={{
                title: "Add food",
                headerShown: true,
                presentation: "modal",
              }}
            />
            <Stack.Screen
              name="food-barcode"
              options={{
                title: "Scan barcode",
                headerShown: true,
                presentation: "modal",
              }}
            />
          </Stack>
          <AgentFabAndSheet />
        </AuthGate>
      </GestureRoot>
    </QueryProvider>
  );
}
