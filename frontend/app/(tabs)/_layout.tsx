import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";

import { themes } from "@/src/theme";

const colors = themes.dark ?? themes.light;
const isIOS26 = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

export default function TabsLayout() {
  if (isIOS26) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="overview">
          <Icon sf="square.grid.2x2" />
          <Label>Overview</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="jobs">
          <Icon sf="briefcase" />
          <Label>Jobs</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="rankings">
          <Icon sf="trophy" />
          <Label>Rankings</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="ai">
          <Icon sf="message" />
          <Label>AI</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.divider,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="briefcase-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: "Rankings",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="podium-gold" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="message-text-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
