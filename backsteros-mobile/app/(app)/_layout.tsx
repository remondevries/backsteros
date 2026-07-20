import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { ActivityIndicator, View } from "react-native";

import {
  FloatingTabBar,
  type FloatingTabBarProps,
} from "../../components/floating-tab-bar";
import {
  ComposeNavIcon,
  InboxNavIcon,
  JournalNavIcon,
  TasksNavIcon,
} from "../../components/nav-icons";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";

const hiddenTabOptions = {
  href: null,
} as const;

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View style={ui.screen}>
      <Tabs
        tabBar={(props) => (
          <FloatingTabBar {...(props as unknown as FloatingTabBarProps)} />
        )}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: colors.foreground,
          tabBarInactiveTintColor: colors.muted,
          // Real bar lives in FullWindowOverlay; collapse the default slot.
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            height: 0,
          },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen
          name="inbox"
          options={{
            title: "Inbox",
            tabBarAccessibilityLabel: "Inbox",
            tabBarIcon: ({ color, size }) => (
              <InboxNavIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="journal"
          options={{
            title: "Journal",
            tabBarAccessibilityLabel: "Journal",
            tabBarIcon: ({ color, size }) => (
              <JournalNavIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: "Tasks",
            tabBarAccessibilityLabel: "Tasks",
            tabBarIcon: ({ color, size }) => (
              <TasksNavIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen name="projects" options={hiddenTabOptions} />
        <Tabs.Screen name="letters" options={hiddenTabOptions} />
        <Tabs.Screen name="knowledge" options={hiddenTabOptions} />
        <Tabs.Screen name="contacts" options={hiddenTabOptions} />
        <Tabs.Screen name="organizations" options={hiddenTabOptions} />
        <Tabs.Screen
          name="compose"
          options={{
            title: "Create",
            tabBarAccessibilityLabel: "Create item",
            tabBarIcon: ({ color, size }) => (
              <ComposeNavIcon color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
