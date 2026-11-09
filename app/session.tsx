import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import { Subscription } from "react-native-ble-plx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./authContext";
import { manager, useBLE } from "./bleContext";

// Battery voltage (5th CSV field from the board) to a display percentage, interpolated linearly
// between these breakpoints and clamped outside them. 100% down to 0% in 10% steps, in mV.
//
// Source: Meshtastic firmware src/power.h (OCV_ARRAY), an open-source table with no cited origin.
// It agrees with TI application note SLUAAR3, which gives 3.72 V at rest as 50%.
// It describes a cell at rest. This board measures under load from the dust sensor fan and the
// BLE radio, so the figure still overstates remaining charge by some unknown amount.
// The cell is a generic 103665 with no manufacturer discharge curve. Replace this table with
// measurements from an actual discharge of this board when those exist.
const BATTERY_CURVE_MV = [4190, 4050, 3990, 3890, 3800, 3720, 3630, 3530, 3420, 3300, 3100];

function batteryPercent(volts: number) {
  const mv = volts * 1000;
  const curve = BATTERY_CURVE_MV;
  if (mv >= curve[0]) return 100;
  if (mv <= curve[curve.length - 1]) return 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const hi = curve[i];
    const lo = curve[i + 1];
    if (mv <= hi && mv >= lo) {
      const pctLo = (curve.length - 2 - i) * 10;
      return Math.round(pctLo + ((mv - lo) / (hi - lo)) * 10);
    }
  }
  return 0;
}

// Colour bands, defined by voltage and converted through the curve so they move with it.
// Orange: at or below 3.5 V, where the firmware switches its green LED off (main.py:175), so the
// app and the board agree on "low". Red: at or below 3.3 V, where the curve's last 10% begins and
// falls steeply to empty; under load the cell reaches the 3.0 V cutoff soon after.
const BATTERY_LOW_PCT = batteryPercent(3.5);
const BATTERY_CRITICAL_PCT = batteryPercent(3.3);

const SERVICE_UUID = "0000181A-0000-1000-8000-00805F9B34FB";
const CHAR_UUID = "00002A6E-0000-1000-8000-00805F9B34FB";

function RecordingBadge() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setVisible(v => !v), 600);
    return () => clearInterval(interval);
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: visible ? "#e53935" : "transparent", marginRight: 8 }} />
      <Text style={{ color: "#e53935", fontSize: 16, fontWeight: "600" }}>Recording</Text>
    </View>
  );
}

export default function Session() {
  const router = useRouter();
  const navigation = useNavigation();
  const { connectedDevice } = useBLE();
  const { profile } = useAuth();
  // All padding lives on the content container, never on the ScrollView's own style. Style
  // padding offsets the content (paddingTop pushed it down 60) without growing the scroll range,
  // so the bottom 60 of content could never scroll into view and "End Session" stayed under the
  // navigation bar. Here the inset clears the nav bar and the button's 40 margin is the gap above it.
  const insets = useSafeAreaInsets();

  // Account-synced profile (cached offline) stamps the session metadata into each CSV row.
  const className = profile?.instructor || "";
  // The class's school name — the same value the upload sends, so the exported CSV and the
  // stored session agree instead of the upload silently overriding a different string.
  const school = profile?.schoolName || "";
  const period = profile?.period || "";
  const group = profile?.groupCode || "";

  const [initialized, setInitialized] = useState(false);
  // Set right before the screen's own exits (Discard, Save & Exit, device lost), which have already
  // settled what happens to the recording and must not trigger the leave confirmation.
  const skipLeaveConfirmRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setInitialized(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (initialized && !connectedDevice) {
        // The device is gone, so there is nothing to keep recording; leave without asking.
        skipLeaveConfirmRef.current = true;
        router.replace("/");
      }
    }, [connectedDevice, initialized])
  );

  const [sessionName, setSessionName] = useState("");
  const [siteType, setSiteType] = useState("Indoor");
  // The screen opens in setup (name + site type) and only records once Record is tapped. Before
  // that, readings may arrive but no timer runs and no rows are written.
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState("");
  const canRecord = sessionName.trim().length > 0;

  // Header back, Android hardware back and any other pop all remove this screen through the
  // navigator, so one hook covers them. Setup state is not guarded: nothing is recorded yet.
  usePreventRemove(recording, ({ data }) => {
    if (skipLeaveConfirmRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert(
      "Stop recording?",
      "If you leave now, this recording will be lost. To keep it, tap End Session and choose Save & Exit.",
      [
        { text: "Keep Recording", style: "cancel" },
        {
          text: "Discard & Leave",
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  const [pm25, setPm25] = useState(0);
  const [co, setCo] = useState(0);
  const [temp, setTemp] = useState(0);
  const [hum, setHum] = useState(0);
  const [lat, setLat] = useState(0);
  const [lon, setLon] = useState(0);
  const [battery, setBattery] = useState(0);
  const batteryPct = batteryPercent(battery);
  const [isReceiving, setIsReceiving] = useState(false);

  const csvRows = useRef<string[]>([]);
  const timerRef = useRef<any>(null);
  // The live-data notification. Kept so it can be removed: a discarded handle keeps notifying a
  // dead screen, and every later session adds another one on top.
  const monitorRef = useRef<Subscription | null>(null);

  const stopMonitoring = () => {
    monitorRef.current?.remove();
    monitorRef.current = null;
  };

  useEffect(() => {
    // Subscribe on open, as before: the live data starts flowing during setup so the first reading
    // is already in hand when Record is tapped. Rows are gated on `recording`, not on this.
    if (connectedDevice) {
      connectAndListen(connectedDevice.id);
    }
    getLocation();

    // Unmount stops listening but deliberately keeps the connection: only Settings > Disconnect
    // releases the device, so a student can end one session and start the next without re-pairing.
    return () => {
      clearInterval(timerRef.current);
      manager.stopDeviceScan();
      stopMonitoring();
    };
  }, []);

  const startRecording = () => {
    if (!canRecord || recording) return;
    setSessionName(sessionName.trim());
    setStartTime(new Date().toISOString());
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);
    setRecording(true);
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const loc = await Location.getCurrentPositionAsync({});
    setLat(loc.coords.latitude);
    setLon(loc.coords.longitude);
  };

  const connectAndListen = async (id: string) => {
    try {
      stopMonitoring();
      monitorRef.current = connectedDevice!.monitorCharacteristicForService(SERVICE_UUID, CHAR_UUID, (error, char) => {
        if (error || !char?.value) return;
        const decoded = atob(char.value);
        const parts = decoded.split(",");
        if (parts.length >= 4) {
          setPm25(parseFloat(parts[0]) || 0);
          setCo(parseFloat(parts[1]) || 0);
          setTemp(parseFloat(parts[2]) || 0);
          setHum(parseFloat(parts[3]) || 0);
          if (parts[4]) setBattery(parseFloat(parts[4]) || 0);          
          setIsReceiving(true);
        }
      });
    } catch (e) {
      console.log("BLE error:", e);
    }
  };

  useEffect(() => {
    if (temp === 0 && hum === 0) return;
    // Setup readings are previews only. Recording can't start without a name and the name is
    // locked once it does, so this also replaces the old empty-name check.
    if (!recording) return;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
    const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;
    const sessionId = `${className}_${period}_${group}_${Date.now()}`;
    const row = `${ts},${date},${time},${sessionId},${sessionName},${school},${className},${period},${group},${sessionName},${lat},${lon},${siteType},${pm25},${co},${temp},${hum}`;
    csvRows.current.push(row);
  }, [pm25, co, temp, hum]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const endSession = async () => {
    Alert.alert(
      "End Session",
      "What would you like to do?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            skipLeaveConfirmRef.current = true;
            router.replace("/");
          },
        },
        { text: "Save & Exit", onPress: () => saveAndExit() },
      ]
    );
  };

  const sanitizeName = (name: string) => {
    return name
      .replace(/[^a-zA-Z0-9가-힣\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 20)
      .toLowerCase();
  };

  const [saving, setSaving] = useState(false);

  const saveAndExit = async () => {
    if (saving) return;
    if (!sessionName.trim()) {
      Alert.alert("Session Name Required", "Please enter a session name before saving.");
      return;
    }
    setSaving(true);
    clearInterval(timerRef.current);
    const header = "Timestamp,Date,Time,Session ID,Session Name,School,Class (Instructor),Period,Group,Location,Latitude,Longitude,INDOOR/OUTDOOR,PM 2.5,CO,Temperature,Humidity";
    const csvContent = [header, ...csvRows.current].join("\n");
    const cleanSession = sanitizeName(sessionName);
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T]/g, "").substring(0, 14);
    const fileName = `${cleanSession}_${dateStr}.csv`;
    const filePath = FileSystem.documentDirectory + fileName;
    await FileSystem.writeAsStringAsync(filePath, csvContent, { encoding: "utf8" });
    console.log("Saved to:", filePath);
    // Saved: this screen stays under History, and removing it later must not warn about loss.
    skipLeaveConfirmRef.current = true;
    router.push("/history");
    // Ending a session keeps the device connected for the next one. Pushing History leaves this
    // screen mounted underneath, so stop its notification here rather than waiting for unmount.
    stopMonitoring();
    setSaving(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>New Session</Text>
{connectedDevice && (
        // Wraps instead of overflowing: on a narrow phone the battery badge drops to its own line,
        // and a device name too long even for a full line ellipsizes rather than pushing off-screen.
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, marginBottom: 16 }}>
          <View style={[styles.connectedBadge, { flexShrink: 1 }]}>
            <Text style={styles.connectedText} numberOfLines={1} ellipsizeMode="tail">
              Device Connected: {connectedDevice.name}
            </Text>
          </View>
{battery > 0 && (
            <View style={[styles.connectedBadge, { 
              backgroundColor: 
                battery >= 4.2 ? "#e8f0fe" :
                batteryPct <= BATTERY_CRITICAL_PCT ? "#ffebee" :
                batteryPct <= BATTERY_LOW_PCT ? "#fff3e0" :
                "#e6f4ea"
            }]}>
              <Text style={[styles.connectedText, { 
                color: 
                  battery >= 4.2 ? "#1a73e8" :
                  batteryPct <= BATTERY_CRITICAL_PCT ? "#c62828" :
                  batteryPct <= BATTERY_LOW_PCT ? "#e65100" :
                  "#2e7d32"
              }]}>
{battery >= 4.2 
                  ? `🔋⚡ (${batteryPct}%)`
                  : `🔋 ${batteryPct}%`}
              </Text>
            </View>
          )}
        </View>
      )}
      {!recording ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Session Name (e.g. Bus station)"
            value={sessionName}
            onChangeText={setSessionName}
            returnKeyType="done"
          />

          <View style={styles.siteRow}>
            <Text style={styles.label}>Site type</Text>
            <TouchableOpacity
              style={[styles.siteBtn, siteType === "Indoor" && styles.siteBtnActive]}
              onPress={() => setSiteType("Indoor")}
            >
              <Text style={[styles.siteBtnText, siteType === "Indoor" && styles.siteBtnTextActive]}>Indoor</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.siteBtn, siteType === "Outdoor" && styles.siteBtnActive]}
              onPress={() => setSiteType("Outdoor")}
            >
              <Text style={[styles.siteBtnText, siteType === "Outdoor" && styles.siteBtnTextActive]}>Outdoor</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.recordButton, !canRecord && styles.recordButtonDisabled]}
            onPress={startRecording}
            disabled={!canRecord}
            accessibilityState={{ disabled: !canRecord }}
          >
            <Text style={[styles.recordButtonText, !canRecord && styles.recordButtonTextDisabled]}>● Record</Text>
          </TouchableOpacity>
          {!canRecord ? <Text style={styles.hint}>Enter a session name to start recording.</Text> : null}
        </>
      ) : (
        <>
          {isReceiving ? <RecordingBadge /> : <Text style={styles.waiting}>Waiting for sensor data…</Text>}

          {/* Locked for the rest of the session: every row is stamped with these. */}
          <View style={styles.summary}>
            {/* The name column is only as wide as its text and Site type sits a fixed gap after it.
                It shrinks (minWidth 0 lets it go below its text width) only when the two don't fit,
                which is what makes a long name ellipsize instead of pushing Site type off. */}
            <View style={styles.summaryName}>
              <Text style={styles.summaryLabel}>Session</Text>
              <Text style={styles.summaryValue} numberOfLines={1} ellipsizeMode="tail">{sessionName}</Text>
            </View>
            <View>
              <Text style={styles.summaryLabel}>Site type</Text>
              <Text style={styles.summaryValue}>{siteType}</Text>
            </View>
          </View>

          <Text style={styles.info}>Start Time: {new Date(startTime).toLocaleString()}</Text>
          <Text style={styles.info}>Duration: {formatDuration(duration)}</Text>
          <Text style={styles.info}>Location: {lat.toFixed(4)}, {lon.toFixed(4)}</Text>

          <Text style={styles.sectionTitle}>Data Preview</Text>

          <View style={styles.dataGrid}>
            <View style={styles.dataCard}>
              <Text style={styles.dataValue}>{pm25}</Text>
              <Text style={styles.dataLabel}>PM2.5 ug/m3</Text>
            </View>
            <View style={styles.dataCard}>
              <Text style={styles.dataValue}>{co}</Text>
              <Text style={styles.dataLabel}>CO ppm</Text>
            </View>
            <View style={styles.dataCard}>
              <Text style={styles.dataValue}>{temp}</Text>
              <Text style={styles.dataLabel}>Temp C</Text>
            </View>
            <View style={styles.dataCard}>
              <Text style={styles.dataValue}>{hum}</Text>
              <Text style={styles.dataLabel}>Hum %</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.endButton} onPress={endSession}>
            <Text style={styles.endButtonText}>{saving ? "Saving..." : "End Session"}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingTop: 60 },
  header: { fontSize: 29, fontWeight: "bold", color: "#1a73e8", marginBottom: 20 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 17, marginBottom: 16 },
  siteRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  label: { fontSize: 17, color: "#333", marginRight: 8 },
  siteBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#ddd" },
  siteBtnActive: { backgroundColor: "#1a73e8", borderColor: "#1a73e8" },
  siteBtnText: { color: "#888", fontSize: 16 },
  siteBtnTextActive: { color: "#fff" },
  info: { fontSize: 16, color: "#555", marginBottom: 4 },
  sectionTitle: { fontSize: 19, fontWeight: "600", color: "#333", marginTop: 16, marginBottom: 12 },
  dataGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 },
  dataCard: { width: "46%", backgroundColor: "#f5f5f5", borderRadius: 12, padding: 16, alignItems: "center" },
  dataCardActive: { backgroundColor: "#1a73e8" },
  dataValue: { fontSize: 34, fontWeight: "bold", color: "#333" },
  dataLabel: { fontSize: 15, color: "#888", marginTop: 4 },
  batteryWarning: { backgroundColor: "#ffebee", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16, width: "100%", alignItems: "center" },
  batteryWarningText: { color: "#c62828", fontSize: 16, fontWeight: "600" },
  connectedBadge: { backgroundColor: "#e6f4ea", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 16, alignSelf: "flex-start" },
  connectedText: { color: "#2e7d32", fontSize: 16, fontWeight: "600" },
  recordButton: { backgroundColor: "#e53935", padding: 16, borderRadius: 12, alignItems: "center", marginTop: 8, marginBottom: 8 },
  recordButtonDisabled: { backgroundColor: "#eee" },
  recordButtonText: { color: "#fff", fontSize: 19, fontWeight: "600" },
  recordButtonTextDisabled: { color: "#aaa" },
  hint: { fontSize: 15, color: "#888", textAlign: "center", marginBottom: 40 },
  waiting: { fontSize: 16, color: "#888", marginBottom: 12 },
  summary: { flexDirection: "row", gap: 16, backgroundColor: "#f5f5f5", borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryName: { flexShrink: 1, minWidth: 0 },
  summaryLabel: { fontSize: 13, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 18, color: "#333", fontWeight: "600" },
  endButton: { backgroundColor: "#1a73e8", padding: 16, borderRadius: 12, alignItems: "center", marginBottom: 40 },
  endButtonText: { color: "#fff", fontSize: 19, fontWeight: "600" },
});