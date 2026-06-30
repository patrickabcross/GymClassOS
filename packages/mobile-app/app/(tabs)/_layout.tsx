// Role-branched tab shell. MA3-03 adds a teacher tab set on top of the member
// 5-tab shell (R5-02). The app never shows a role toggle — useRole() reads the
// caller's role from GET /api/m/me and the `href` option toggles which tabs are
// reachable:
//   • member → Home / Classes / Passes / Log / Profile (the original 5 tabs)
//   • teacher → Schedule (assigned sessions) / Profile
//   • admin  → Profile only (admin ops live in the AI sheet FAB, MA4)
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
  const isMember = role === "member";
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
      {/* ── Member tabs (hidden for teachers/admins via href: null) ──── */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          href: isMember ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Classes",
          href: isMember ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="passes"
        options={{
          title: "Passes",
          href: isMember ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="award" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="food"
        options={{
          title: "Log",
          href: isMember ? undefined : null,
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
