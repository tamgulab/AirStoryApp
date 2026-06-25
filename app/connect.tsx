import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Device } from "react-native-ble-plx";
import { manager, useBLE } from "./bleContext";

export default function Connect() {
  const router = useRouter();
  const { setConnectedDevice, connectedDevice } = useBLE();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const startScan = async () => {
    const ok = await requestPermissions();
    if (!ok) {
      Alert.alert("Permission denied", "Bluetooth permissions are required.");
      return;
    }
    setScanning(true);
    setDevices([]);
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) { setScanning(false); return; }
      if (device && device.name && device.name.includes("AirStory")) {
        setDevices(prev => {
          if (prev.find(d => d.id === device.id)) return prev;
          return [...prev, device];
        });
      }
    });
    setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
    }, 10000);
  };

const [connecting, setConnecting] = useState(false);

const connectDevice = async (device: Device) => {
    try {
      manager.stopDeviceScan();
      setScanning(false);
      setConnecting(true);
      const d = await device.connect();
      await d.discoverAllServicesAndCharacteristics();
      setConnectedDevice(d);
      await AsyncStorage.setItem("savedMacAddress", device.id);
      setConnecting(false);
    } catch (e) {
      setConnecting(false);
      Alert.alert("Connection failed", "Could not connect to device.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{"Let's connect!"}</Text>
      <Text style={styles.subtitle}>Please select the device to connect</Text>
      {scanning && <ActivityIndicator size="large" color="#1a73e8" style={{ marginVertical: 20 }} />}
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={!scanning ? <Text style={styles.empty}>No devices found</Text> : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.deviceItem, connectedDevice?.id === item.id && styles.deviceItemSelected]}
            onPress={() => connectDevice(item)}
          >
            <View>
              <Text style={styles.deviceName}>{item.name}</Text>
              <Text style={styles.deviceId}>ID: {item.id}</Text>
            </View>
            {connectedDevice?.id === item.id && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>
        )}
      />
      {connecting ? (
        <View style={styles.buttonPrimary}>
          <Text style={styles.buttonText}>Connecting...</Text>
        </View>
      ) : !connectedDevice ? (
        <TouchableOpacity style={styles.buttonPrimary} onPress={startScan}>
          <Text style={styles.buttonText}>{scanning ? "Scanning..." : "Scan for Devices"}</Text>
        </TouchableOpacity>
      ) : (
 <TouchableOpacity style={styles.buttonPrimary} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Finish Connection</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 24, paddingTop: 60 },
  title: { fontSize: 34, fontWeight: "bold", color: "#1a73e8", marginBottom: 8 },
  subtitle: { fontSize: 17, color: "#888", marginBottom: 24 },
  list: { flex: 1, marginBottom: 16 },
  empty: { textAlign: "center", color: "#888", marginTop: 40, fontSize: 17 },
  deviceItem: { backgroundColor: "#f5f5f5", padding: 16, borderRadius: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deviceItemSelected: { backgroundColor: "#1a73e8" },
  deviceName: { fontSize: 19, fontWeight: "600", color: "#333" },
  deviceId: { fontSize: 15, color: "#888" },
  check: { fontSize: 22, color: "#fff" },
  buttonPrimary: { backgroundColor: "#1a73e8", padding: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 },
  buttonText: { color: "#fff", fontSize: 19, fontWeight: "600" },
  back: { alignItems: "center", padding: 8 },
  backText: { color: "#1a73e8", fontSize: 17 },
});
