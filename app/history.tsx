import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Session {
  id: string;
  name: string;
  path: string;
  uploaded: boolean;
}

export default function History() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory!);
      const csvFiles = files.filter(f => f.endsWith(".csv"));
      const loaded = csvFiles.map(f => ({
        id: f,
        name: f.replace("session_", "").replace(".csv", ""),
        path: FileSystem.documentDirectory + f,
        uploaded: false,
      }));
      setSessions(loaded);
    } catch (e) {
      console.log("Error loading sessions:", e);
    }
  };

  const shareSession = async (session: Session) => {
    try {
      await Sharing.shareAsync(session.path);
    } catch (e) {
      console.log("Share error:", e);
    }
  };

  const deleteSession = async (session: Session) => {
    Alert.alert(
      "Delete Session",
      "Are you sure you want to delete this session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(session.path);
              loadSessions();
            } catch (e) {
              console.log("Delete error:", e);
            }
          }
        }
      ]
    );
  };

  const formatName = (fileName: string) => {
    const withoutExt = fileName.replace(".csv", "");
    const lastUnderscore = withoutExt.lastIndexOf("_");
    if (lastUnderscore !== -1) {
      const dateStr = withoutExt.substring(lastUnderscore + 1);
      const sessionName = withoutExt.substring(0, lastUnderscore).replace(/_/g, " ");
      if (dateStr.length === 14) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = dateStr.substring(8, 10);
        const min = dateStr.substring(10, 12);
        const dateFormatted = `${year}. ${month}. ${day}. ${hour}:${min}`;
        return { name: sessionName, date: dateFormatted };
      }
    }
    return { name: withoutExt, date: "" };
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session History</Text>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: "red" }]} />
          <Text style={styles.legendText}>Pending for Upload</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: "green" }]} />
          <Text style={styles.legendText}>Uploaded</Text>
        </View>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No sessions yet</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.sessionItem}>
            <TouchableOpacity style={styles.sessionInfo} onPress={() => shareSession(item)}>
              <Text style={styles.sessionName}>{formatName(item.name).name}</Text>
              <Text style={styles.sessionTime}>{formatName(item.name).date}</Text>
              <Text style={styles.exportText}>Tap to export CSV</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={[styles.dot, { backgroundColor: item.uploaded ? "green" : "red" }]} />
              <TouchableOpacity onPress={() => deleteSession(item)} style={styles.deleteBtn}>
                <Text style={{ color: "red", fontSize: 22 }}>🗑</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <TouchableOpacity style={styles.buttonPrimary} onPress={loadSessions}>
        <Text style={styles.buttonText}>Refresh</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.buttonHome} onPress={() => router.replace("/")}>
        <Text style={styles.buttonHomeText}>Go to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a73e8",
    marginBottom: 16,
  },
  legend: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    color: "#888",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  list: {
    flex: 1,
  },
  empty: {
    textAlign: "center",
    color: "#888",
    marginTop: 40,
    fontSize: 14,
  },
  sessionItem: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exportText: {
    fontSize: 11,
    color: "#1a73e8",
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  sessionTime: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
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
  buttonHome: {
    borderWidth: 1.5,
    borderColor: "#1a73e8",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonHomeText: {
    color: "#1a73e8",
    fontSize: 16,
    fontWeight: "600",
  },
});
