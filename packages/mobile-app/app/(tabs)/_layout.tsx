// Role-branched tab shell. MA3-03 adds a teacher tab set on top of the member
// 5-tab shell (R5-02). The app never shows a role toggle — useRole() reads the
// caller's role from GET /api/m/me and the `href` option toggles which tabs are
// reachable:
//   • member → Home / Classes / Passes / Log / Profile (the original 5 tabs)
//   • teacher → Home / Classes / Passes / Log / Profile + Schedule (additive)
//   • admin  → Home / Classes / Passes / Log / Profile + ops FAB (MA4)
// Member tabs (Home/Classes/Passes/Log) are now visible for ALL roles — teachers
// get those 5 plus the additive Schedule tab. The FAB is admin-only (see _layout.tsx).
// Every <Tabs.Screen> stays declared unconditionally (the Expo Router idiom);
// only `href` flips visibility — never conditionally unmount the children.
// Agent surface is a FAB rendered in app/_layout.tsx (D2-06 / MA4), not a tab.
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../lib/theme";
import { useRole } from "../../lib/use-role";

export default function TabsLayout() {
  const theme = useTheme();
  const { role } = useRole();
  const isTeacher = role === "teacher";
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
      {/* ── Member tabs — visible for all roles (member / teacher / admin) ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          href: undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Classes",
          href: undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="passes"
        options={{
          title: "Passes",
          href: undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="award" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: "Log",
          href: undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="coffee" size={size} color={color} />
          ),
        }}
      />
      {/* ── Teacher tab (visible only for role === "teacher") ────────── */}
      <Tabs.Screen
        name="teacher-schedule"
        options={{
          title: "Schedule",
          href: isTeacher ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      {/* ── Profile — visible for all roles ─────────────────────────── */}
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
