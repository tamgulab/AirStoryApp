import { Stack } from "expo-router";
import { BLEProvider } from "./bleContext";

export default function RootLayout() {
  return (
    <BLEProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: "Home" }} />
        <Stack.Screen name="history" options={{ title: "Session History" }} />
      </Stack>
    </BLEProvider>
  );
}