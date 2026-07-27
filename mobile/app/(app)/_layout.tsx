import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { ActivityIndicator, View } from "react-native";

import {
  FloatingTabBar,
  type FloatingTabBarProps,
} from "../../components/floating-tab-bar";
import {
  AreasNavIcon,
  ComposeNavIcon,
  InboxNavIcon,
  JournalNavIcon,
  KnowledgeBaseNavIcon,
  LettersNavIcon,
  TasksNavIcon,
} from "../../components/nav-icons";
import { ProjectIcon } from "../../components/project-icon";
import { TerminalConsoleIcon } from "../../components/terminal-console-icon";
import { isPadDevice } from "../../lib/device";
import { useGoNavigationShortcuts } from "../../lib/use-go-navigation-shortcuts";
import { colors } from "../../lib/theme";
import { ui } from "../../lib/ui";

/** Keep in the tab navigator (for FloatingTabBar) but hide from the default strip. */
const overflowTabOptions = {
  href: null,
} as const;

/** iPad promotes these into the tray — they must remain href-linkable. */
const IPAD_TRAY_ROUTES = new Set([
  "areas",
  "development",
  "letters",
  "knowledge",
]);

function tabOverflowOptions(routeName: string) {
  if (isPadDevice() && IPAD_TRAY_ROUTES.has(routeName)) {
    return {};
  }
  return overflowTabOptions;
}

function SignedInTabs() {
  useGoNavigationShortcuts(true);

  return (
    <View style={ui.screen}>
      <Tabs
        tabBar={(props) => (
          <FloatingTabBar {...(props as unknown as FloatingTabBarProps)} />
        )}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          lazy: true,
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
        <Tabs.Screen
          name="areas"
          options={{
            ...tabOverflowOptions("areas"),
            title: "Areas",
            tabBarAccessibilityLabel: "Areas",
            tabBarIcon: ({ color, size }) => (
              <AreasNavIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="projects"
          options={{
            ...overflowTabOptions,
            title: "Projects",
            tabBarAccessibilityLabel: "Projects",
            tabBarIcon: ({ color, size }) => (
              <ProjectIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="development"
          options={{
            ...tabOverflowOptions("development"),
            title: "Development",
            tabBarAccessibilityLabel: "Development",
            tabBarIcon: ({ color, size }) => (
              <TerminalConsoleIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="letters"
          options={{
            ...tabOverflowOptions("letters"),
            title: "Letters",
            tabBarAccessibilityLabel: "Letters",
            tabBarIcon: ({ color, size }) => (
              <LettersNavIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="knowledge"
          options={{
            ...tabOverflowOptions("knowledge"),
            title: "Knowledge Base",
            tabBarAccessibilityLabel: "Knowledge Base",
            tabBarIcon: ({ color, size }) => (
              <KnowledgeBaseNavIcon color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen name="contacts" options={overflowTabOptions} />
        <Tabs.Screen name="organizations" options={overflowTabOptions} />
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

  return <SignedInTabs />;
}
