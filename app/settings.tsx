import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { manager, useBLE } from "./bleContext";

export default function Settings() {
  const router = useRouter();
  const { connectedDevice, setConnectedDevice } = useBLE();
  const [period, setPeriod] = useState("");
  const [group, setGroup] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const p = await AsyncStorage.getItem("period");
      const g = await AsyncStorage.getItem("group");
      if (p) setPeriod(p);
      if (g) setGroup(g);
    } catch (e) {
      console.log("Load settings error:", e);
    }
  };

  const sanitize = (text: string) => {
    return text.replace(/[^a-zA-Z0-9가-힣]/g, "").substring(0, 20);
  };

  const saveSettings = async () => {
    if (!period || !group) {
      alert("Please fill in all fields.");
      return;
    }
    try {
      await AsyncStorage.setItem("className", "Mr. Sikich");
      await AsyncStorage.setItem("period", period);
      await AsyncStorage.setItem("group", sanitize(group));
      router.replace("/");
    } catch (e) {
      console.log("Save settings error:", e);
    }
  };

const resetAll = async () => {
    Alert.alert(
      "Reset All",
      "This will reset all settings and device connection. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset All",
          style: "destructive",
          onPress: async () => {
            if (connectedDevice) {
              try {
                await manager.cancelDeviceConnection(connectedDevice.id);
              } catch (e) {
                console.log("Disconnect error:", e);
              }
            }
            setConnectedDevice(null);
            await AsyncStorage.clear();
            setPeriod("");
            setGroup("");
            Alert.alert("Done", "All settings and device connection have been reset.");
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Group Settings</Text>
      <Text style={styles.subtitle}>Philadelphia High School for Girls</Text>

      <Text style={styles.label}>Class (Instructor)</Text>
      <View style={styles.fixedInput}>
        <Text style={styles.fixedText}>Mr. Sikich</Text>
      </View>

      <Text style={styles.label}>Period</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 1"
        value={period}
        onChangeText={(text) => setPeriod(text.replace(/[^0-9]/g, "").substring(0, 1))}
        keyboardType="numeric"
        maxLength={1}
      />

      <Text style={styles.label}>Group Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. G1"
        value={group}
        onChangeText={(text) => setGroup(sanitize(text))}
        maxLength={20}
      />

      <TouchableOpacity style={styles.buttonPrimary} onPress={saveSettings}>
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>

       <TouchableOpacity style={styles.buttonReset} onPress={resetAll}>
        <Text style={styles.buttonResetText}>Reset All Settings & Device</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a73e8",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
    fontWeight: "600",
  },
  fixedInput: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    backgroundColor: "#f9f9f9",
  },
  fixedText: {
    fontSize: 14,
    color: "#888",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 20,
  },
  buttonPrimary: {
    backgroundColor: "#1a73e8",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonReset: {
    borderWidth: 1.5,
    borderColor: "red",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonResetText: {
    color: "red",
    fontSize: 16,
    fontWeight: "600",
  },
  back: {
    alignItems: "center",
    padding: 8,
  },
  backText: {
    color: "#1a73e8",
    fontSize: 14,
  },
});
