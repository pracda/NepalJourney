import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const NEPAL_RED = "#DC143C";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function icon(name: IconName, focused: boolean) {
  return <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={24} color={focused ? NEPAL_RED : "#888"} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: NEPAL_RED,
        tabBarInactiveTintColor: "#888",
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#e0e8f0" },
        headerStyle: { backgroundColor: "#DC143C" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Plan Trek",
          tabBarIcon: ({ focused }) => icon("map", focused),
          headerTitle: "Nepal Journey",
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: "Live Map",
          tabBarIcon: ({ focused }) => icon("location", focused),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="translate"
        options={{
          title: "Translate",
          tabBarIcon: ({ focused }) => icon("language", focused),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ focused }) => icon("calendar", focused),
        }}
      />
    </Tabs>
  );
}
