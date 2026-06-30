import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const NEPAL_BLUE = "#003893";
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
        headerStyle: { backgroundColor: NEPAL_BLUE },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Yatra",
          tabBarIcon: ({ focused }) => icon("chatbubble-ellipses", focused),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ focused }) => icon("calendar", focused),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ focused }) => icon("cash", focused),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => icon("person", focused),
        }}
      />
    </Tabs>
  );
}
