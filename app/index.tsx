import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useBLE } from "./bleContext";

export default function Index() {
  const router = useRouter();
  const { connectedDevice } = useBLE();
  const [groupSet, setGroupSet] = useState(true);
  const [period, setPeriod] = useState("");
  const [group, setGroup] = useState("");

  useFocusEffect(
    React.useCallback(() => {
      checkGroupSettings();
    }, [])
  );

  const checkGroupSettings = async () => {
    try {
      const g = await AsyncStorage.getItem("group");
      const p = await AsyncStorage.getItem("period");
      if (!g) {
        setGroupSet(false);
      } else {
        setGroupSet(true);
        setGroup(g);
        setPeriod(p || "");
      }
    } catch (e) {
      console.log("Check settings error:", e);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AirStory</Text>
      <Text style={styles.subtitle}>TAMGU Lab</Text>
      <Text style={styles.school}>Philadelphia High School for Girls</Text>
      {groupSet && period && group ? (
        <Text style={styles.groupInfo}>Mr. Sikich | Period {period} | Group {group}</Text>
      ) : null}

      {!groupSet && (
        <TouchableOpacity
          style={styles.warningBadge}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.warningText}>Please set your Group first!</Text>
        </TouchableOpacity>
      )}

      {connectedDevice ? (
        <View style={styles.connectedBadge}>
          <Text style={styles.connectedText}>Device Connected: {connectedDevice.name}</Text>
        </View>
      ) : (
        <View style={styles.disconnectedBadge}>
          <Text style={styles.disconnectedText}>No Device Connected</Text>
        </View>
      )}

      <View style={styles.buttonContainer}>
        {!connectedDevice ? (
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => router.push("/connect")}
          >
            <Text style={styles.buttonText}>Connect Device</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.buttonPrimary}
            onPress={() => router.push("/session")}
          >
            <Text style={styles.buttonText}>New Session</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.buttonPrimary}
          onPress={() => router.push("/history")}
        >
          <Text style={styles.buttonText}>View History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.buttonOutline}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.buttonOutlineText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 32, fontWeight: "bold", color: "#1a73e8", marginBottom: 4 },
  subtitle: { fontSize: 18, color: "#333", marginBottom: 8 },
  school: { fontSize: 13, color: "#888", marginBottom: 4, textAlign: "center" },
  groupInfo: { fontSize: 13, color: "#1a73e8", marginBottom: 16, fontWeight: "600" },
  warningBadge: { backgroundColor: "#fff3e0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16, width: "100%", alignItems: "center" },
  warningText: { color: "#e65100", fontSize: 13, fontWeight: "600" },
  connectedBadge: { backgroundColor: "#e6f4ea", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 24 },
  connectedText: { color: "#2e7d32", fontSize: 13, fontWeight: "600" },
  disconnectedBadge: { backgroundColor: "#f5f5f5", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 24 },
  disconnectedText: { color: "#888", fontSize: 13 },
  buttonContainer: { width: "100%", gap: 12 },
  buttonPrimary: { backgroundColor: "#1a73e8", padding: 16, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  buttonOutline: { borderWidth: 1.5, borderColor: "#1a73e8", padding: 16, borderRadius: 12, alignItems: "center" },
  buttonOutlineText: { color: "#1a73e8", fontSize: 16, fontWeight: "600" },
});