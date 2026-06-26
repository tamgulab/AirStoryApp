import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { logout } from "./api/auth";
import { useAuth } from "./authContext";

/**
 * Placeholder for first-time account setup (name / role / join code). Full registration is phase 2
 * of the Firebase login work. Two entry paths reach here:
 *  - A signed-out visitor tapping "Sign up" on the login screen.
 *  - A signed-in Firebase user with no app account yet (needsOnboarding).
 */
export default function Onboarding() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="construct-outline" size={40} color="#1a73e8" />
      </View>
      <Text style={styles.title}>Account setup is on the way</Text>
      <Text style={styles.body}>
        Creating a new AirStory account from the phone is coming in the next update. For now, sign in
        with an account you already created on the AirStory web app.
      </Text>

      {user ? (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={async () => {
            await logout();
            // The router gate redirects to /login once the session clears.
          }}
        >
          <Text style={styles.primaryBtnText}>Sign out</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace("/login")}>
          <Text style={styles.primaryBtnText}>Back to Log In</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 28 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#e8f0fe",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#202124", textAlign: "center", marginBottom: 12 },
  body: { fontSize: 15, color: "#5f6368", textAlign: "center", lineHeight: 22, marginBottom: 28 },
  primaryBtn: {
    backgroundColor: "#1a73e8",
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
