// GymClassOS member-app root layout. Wraps the entire app in:
//   1. ThemeProvider — provides the active studio skin tokens to all screens.
//   2. useFonts render-gate — blocks render until Inter OTF weights are loaded.
//   3. QueryProvider (TanStack Query — every screen uses it).
//   4. GestureRoot (gesture-handler root view — required by @gorhom/bottom-sheet
//      used by the agent FAB in D2-06).
//   5. AuthGate — MA1-02 / MA2-02: reads session token from expo-secure-store.
//      As of MA2-02 (MEM-01) the auth wall is NO LONGER at app entry: anonymous
//      (tokenless) users land on the tabs and can browse the schedule. The wall
//      now sits at the Book action (MA2-03), where a Book press by a signed-out
//      member stashes a pending-booking intent and routes to /sign-in. AuthGate
//      only bounces an already-signed-in user OFF /sign-in (back to the tabs).
//      Demo pick-member.tsx is preserved on disk for DEMO_MODE (AUTH-06).
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Pressable, Text } from "react-native";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { QueryProvider } from "../lib/query-client";
import { getSessionToken } from "../lib/session";
import { fetchRole, type AppRole } from "../lib/whoami";
import { GestureRoot, AgentSheetContainer } from "../lib/bottom-sheet-impl";
import AgentSheet from "../components/AgentSheet";
import { ThemeProvider, useTheme } from "../lib/theme";

// ---------------------------------------------------------------------------
// AuthGate — waits for member id check before rendering children
// ---------------------------------------------------------------------------

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getSessionToken();
      if (cancelled) return;
      const onSignIn = segments[0] === "sign-in";
      // MEM-01: NO force-redirect for tokenless users — anonymous browse is
      // allowed (the wall moved to the Book press in MA2-03). We only bounce a
      // signed-in user OFF /sign-in back to the tabs. AUTH-03: secure-store is
      // still read on every cold start so a real session persists across
      // restarts (a signed-in member resumes straight into the tabs).
      if (token && onSignIn) router.replace("/(tabs)");
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
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.colors.foreground} />
      </View>
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// AgentFabAndSheet — persistent FAB + agent bottom-sheet on every screen
// ---------------------------------------------------------------------------

// Persistent FAB + agent bottom-sheet — visible on every screen behind the
// AuthGate (so it never shows on /pick-member). Tapping the FAB opens the
// gorhom bottom-sheet (from D2-01 spike) with AgentSheet (from D2-06 Task 2)
// rendered inside. AGENT-01 (chat sheet) + AGENT-02 (3 tools) + AGENT-03
// (streaming) are wired through the AgentSheet → streamAgent → SSE path.
function AgentFabAndSheet() {
  const segments = useSegments();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const theme = useTheme();

  // Resolve role via /api/m/whoami so an admin's sheet points at the admin SSE
  // endpoint. Client-side gating only — the server requireAdmin gate on
  // /api/m/admin/agent/stream is the real boundary (a forced URL still 403s).
  // Re-resolve on auth transitions: segments[0] flips between "sign-in" and
  // "(tabs)", so switching accounts never leaves a STALE role that would wrongly
  // show the owner FAB to a teacher/member (clear on sign-in, refetch on tabs).
  const routeGroup = segments[0];
  useEffect(() => {
    if (routeGroup === "sign-in") {
      setRole(null);
    } else {
      fetchRole().then(setRole);
    }
  }, [routeGroup]);
  const isAdmin = role === "admin";

  // Hide FAB on the sign-in screen (no session yet → no agent context).
  const onSignIn = segments[0] === "sign-in";
  if (onSignIn) return null;

  // FAB is admin/owner only. Members + teachers get NO FAB for now (role-specific
  // chatbots are a future task). role is null while /api/m/whoami resolves → also
  // hidden, so the FAB never flashes before the role is confirmed.
  if (!isAdmin) return null;

  const fab = {
    fabHost: {
      position: "absolute" as const,
      right: 18,
      bottom: 92, // above tab bar (default Expo tab bar ~83 + 9 spacing)
      zIndex: 100,
    },
    fab: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      height: 48,
      paddingHorizontal: 16,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },
    fabLabel: {
      color: theme.colors.accentForeground,
      fontFamily: theme.font.semibold,
      fontSize: 15,
    },
  };

  return (
    <>
      <View pointerEvents="box-none" style={fab.fabHost}>
        <Pressable style={fab.fab} onPress={() => setOpen(true)} hitSlop={8}>
          <Ionicons
            name="sparkles"
            size={18}
            color={theme.colors.accentForeground}
          />
          <Text style={fab.fabLabel}>AI chat</Text>
        </Pressable>
      </View>
      <AgentSheetContainer open={open} onClose={() => setOpen(false)}>
        {open && (
          <AgentSheet
            onClose={() => setOpen(false)}
            endpoint={
              isAdmin ? "/api/m/admin/agent/stream" : "/api/m/agent/stream"
            }
            title={isAdmin ? "RunStudio Ops" : "Agent — GymClassOS Coach"}
          />
        )}
      </AgentSheetContainer>
    </>
  );
}

// ---------------------------------------------------------------------------
// ThemedRoot — inner tree that has access to ThemeContext
// ---------------------------------------------------------------------------

function ThemedRoot() {
  const theme = useTheme();

  const [fontsLoaded] = useFonts({
    "Inter-Regular": require("../assets/fonts/Inter-Regular.otf"),
    "Inter-SemiBold": require("../assets/fonts/Inter-SemiBold.otf"),
    "Inter-Bold": require("../assets/fonts/Inter-Bold.otf"),
  });

  if (!fontsLoaded) {
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

  return (
    <QueryProvider>
      <GestureRoot>
        <StatusBar style="light" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.colors.card },
              headerTintColor: theme.colors.foreground,
              headerTitleStyle: { fontWeight: "600" },
              contentStyle: { backgroundColor: theme.colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* sign-in is the real auth gate (MA1-02). pick-member stays on disk for DEMO_MODE (AUTH-06). */}
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
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
            {/* MA3-03: pushed teacher roster screen (tap a session → roster). */}
            <Stack.Screen
              name="teacher-roster"
              options={{ title: "Roster", headerShown: true }}
            />
          </Stack>
          <AgentFabAndSheet />
        </AuthGate>
      </GestureRoot>
    </QueryProvider>
  );
}

// ---------------------------------------------------------------------------
// RootLayout — outermost: ThemeProvider wraps everything
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}
