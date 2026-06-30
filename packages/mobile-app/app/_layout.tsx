// GymClassOS member-app root layout. Wraps the entire app in:
//   1. ThemeProvider — provides the active studio skin tokens to all screens.
//   2. useFonts render-gate — blocks render until Inter OTF weights are loaded.
//   3. QueryProvider (TanStack Query — every screen uses it).
//   4. GestureRoot (gesture-handler root view — required by @gorhom/bottom-sheet
//      used by the agent FAB in D2-06).
//   5. AuthGate — MA1-02: reads session token from expo-secure-store and
//      redirects to /sign-in when no token present; persists across restarts.
//      Demo pick-member.tsx is preserved on disk for DEMO_MODE (AUTH-06).
import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Pressable } from "react-native";
import { useFonts } from "expo-font";
import { Feather } from "@expo/vector-icons";
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
      // No token → redirect to sign-in (unless already there). AUTH-03: reads
      // secure-store on every cold start so the session persists across restarts.
      if (!token && !onSignIn) router.replace("/sign-in");
      // Token present → skip back to tabs if somehow we landed on sign-in.
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

  // Resolve role once via /api/m/whoami so an admin's sheet points at the admin
  // SSE endpoint. Client-side gating only — the server requireAdmin gate on
  // /api/m/admin/agent/stream is the real boundary (a forced URL still 403s).
  useEffect(() => {
    fetchRole().then(setRole);
  }, []);
  const isAdmin = role === "admin";

  // Hide FAB on the sign-in screen (no session yet → no agent context).
  const onSignIn = segments[0] === "sign-in";
  if (onSignIn) return null;

  // TCH-03: teachers get NO AI surface. The FAB is hidden for any non-member
  // EXCEPT admins, who keep the MA4 admin "RunStudio Ops" sheet (endpoint/title
  // switched by isAdmin below). So: members → coach FAB, admins → ops FAB,
  // teachers → no FAB. role is null while /api/m/whoami resolves → also hidden,
  // so the AI surface never flashes before the role is known.
  if (role !== "member" && !isAdmin) return null;

  const fab = {
    fabHost: {
      position: "absolute" as const,
      right: 18,
      bottom: 92, // above tab bar (default Expo tab bar ~83 + 9 spacing)
      zIndex: 100,
    },
    fab: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    },
  };

  return (
    <>
      <View pointerEvents="box-none" style={fab.fabHost}>
        <Pressable style={fab.fab} onPress={() => setOpen(true)} hitSlop={8}>
          <Feather
            name="message-circle"
            size={24}
            color={theme.colors.accentForeground}
          />
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
