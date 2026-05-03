import { Stack } from "expo-router";
import { BLEProvider } from "./bleContext";

export default function RootLayout() {
  return (
    <BLEProvider>
      <Stack />
    </BLEProvider>
  );
}
