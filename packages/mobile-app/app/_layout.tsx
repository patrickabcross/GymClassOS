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
import { View, ActivityIndicator } from "react-native";
import { QueryProvider } from "../lib/query-client";
import { getCurrentMemberId } from "../lib/current-member";
import { GestureRoot } from "../lib/bottom-sheet-impl";

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
        </AuthGate>
      </GestureRoot>
    </QueryProvider>
  );
}
