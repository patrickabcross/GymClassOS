// GymClassOS 5-tab shell (R5-02). Tabs: Home / Classes / Passes / Log / Profile.
// Agent surface is a FAB rendered in app/_layout.tsx (D2-06), not a tab.
// All hex replaced with theme tokens (MOBL-01 / R5-02).
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.mutedFaint,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.foreground,
        headerTitleStyle: {
          fontFamily: theme.font.semibold,
        },
        tabBarLabelStyle: {
          fontFamily: theme.font.semibold,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Classes",
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="passes"
        options={{
          title: "Passes",
          tabBarIcon: ({ color, size }) => (
            <Feather name="award" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: "Log",
          tabBarIcon: ({ color, size }) => (
            <Feather name="coffee" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
