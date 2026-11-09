import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe, updateMyProfile } from "./api/auth";
import { API_BASE } from "./api/http"; // TEMP-DEBUG(profile-save)
import { type Membership, type Profile, useAuth } from "./authContext";
import { useBLE } from "./bleContext";
import { ChipPicker } from "./components/ChipPicker";
import { groupsFor, normalizeGroup, normalizePeriod, useClassStructure } from "./useClassStructure";

/** The profile fields this screen edits, in their normalised form. */
type Field = "instructor" | "period" | "group";
type FieldValues = Record<Field, string>;
const FIELDS: Field[] = ["instructor", "period", "group"];
const EMPTY_FIELDS: FieldValues = { instructor: "", period: "", group: "" };
const FIELD_LABELS: Record<Field, string> = {
  instructor: "Class (Instructor)",
  period: "Period",
  group: "Group",
};

// normalizePeriod/normalizeGroup only matter for values written before pickers existed
// ("1" -> "P1"); picker output is already correct.
function storedFields(profile: Profile | null): FieldValues {
  return {
    instructor: profile?.instructor || "",
    period: normalizePeriod(profile?.period),
    group: normalizeGroup(profile?.groupCode),
  };
}

function membershipFields(m: Membership): FieldValues {
  return {
    instructor: m.profile?.instructor || "",
    period: normalizePeriod(m.profile?.period),
    group: normalizeGroup(m.profile?.group_code),
  };
}

export default function Settings() {
  const router = useRouter();
  const { disconnectDevice: releaseDevice } = useBLE();
  const {
    profile,
    role,
    classMemberships,
    hasClassWorkspace,
    activeWorkspaceId,
    setActiveWorkspace,
    refreshMe,
  } = useAuth();
  const isTeacher = role === "teacher";
  const insets = useSafeAreaInsets();

  const { structure, loading: loadingStructure, refresh: refreshStructure } =
    useClassStructure(activeWorkspaceId);

  // Instructor is editable by teachers only. Period and group are a student's placement; a teacher
  // has neither, so the pickers are hidden for them (their user_profiles row still has the columns,
  // but nothing anyone sees reads them). School is not editable here — it belongs to the workspace
  // and is set on the web.
  const [instructor, setInstructor] = useState("");
  const [period, setPeriod] = useState("");
  const [group, setGroup] = useState("");
  // The stored value each field was loaded from: what the app last saw on the server. A field is
  // "edited" exactly when its form value differs from its base. Editing a field and putting it
  // back makes it clean again.
  const [base, setBase] = useState<FieldValues>(EMPTY_FIELDS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const form: FieldValues = { instructor, period, group };
  // Each role sends only what it can edit: teachers the instructor, students their placement.
  const editableFields: Field[] = isTeacher ? ["instructor"] : ["period", "group"];
  const editedFields = editableFields.filter((f) => form[f] !== base[f]);

  const applyFields = (values: FieldValues) => {
    setInstructor(values.instructor);
    setPeriod(values.period);
    setGroup(values.group);
  };

  // Seed the form from the active workspace's profile, and re-seed when a refresh brings in new
  // stored values — but only into fields the user has not edited. An edited field keeps both its
  // value and its base, so the pre-save check below still sees that the server moved underneath it.
  // Switching workspace is a different form entirely, so it resets everything.
  const seededWorkspaceRef = useRef<string | null>(null);
  useEffect(() => {
    const stored = storedFields(profile);
    const workspaceId = profile?.workspaceId ?? null;
    const switched = seededWorkspaceRef.current !== workspaceId;
    seededWorkspaceRef.current = workspaceId;
    // `form` and `base` are this render's values: the effect runs right after the render in which
    // the stored profile changed, so they are current.
    const nextForm = { ...form };
    const nextBase = { ...base };
    for (const f of FIELDS) {
      if (switched || form[f] === base[f]) {
        nextForm[f] = stored[f];
        nextBase[f] = stored[f];
      }
    }
    applyFields(nextForm);
    setBase(nextBase);
    // Re-seeding is driven by the stored values only; form/base are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.workspaceId, profile?.instructor, profile?.period, profile?.groupCode]);

  // Free-text names: strip only CSV-breaking characters (matches the web sanitizer).
  const sanitizeName = (t: string) => t.replace(/[",\n\r]/g, "").substring(0, 60);

  const onPullToRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshMe(), refreshStructure()]);
    } finally {
      setRefreshing(false);
    }
  };

  const switchWorkspace = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId) return;
    setError("");
    // The structure hook re-fetches on workspaceId change, and the seeding effect above re-runs
    // when the new workspace's profile arrives.
    await setActiveWorkspace(workspaceId);
  };

  // Sends only the fields edited on this screen. Anything untouched is left out, and the backend
  // keeps its stored value for omitted fields, so a placement changed elsewhere is never
  // overwritten with a copy this screen merely displayed.
  const commitEdits = async (fields: Field[]) => {
    if (!activeWorkspaceId) return;
    setSaving(true);
    try {
      console.log("[profile-save] commitEdits fields", JSON.stringify(fields)); // TEMP-DEBUG(profile-save)
      await updateMyProfile({
        workspaceId: activeWorkspaceId,
        ...(fields.includes("instructor") ? { instructor: instructor.trim() } : {}),
        ...(fields.includes("period") ? { period } : {}),
        ...(fields.includes("group") ? { groupCode: group } : {}),
      });
      // Pull the saved values back and refresh the offline cache, then return home.
      await refreshMe();
      console.log("[profile-save] PATCH ok, refreshMe done, navigating home"); // TEMP-DEBUG(profile-save)
      router.replace("/");
    } catch (e: any) {
      console.log("[profile-save] commitEdits error", String(e?.message || e)); // TEMP-DEBUG(profile-save)
      setError(e?.message || "Could not save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  // The server moved an edited field after this screen loaded it. Never pick a side silently.
  const askAboutConflicts = (conflicts: Field[], server: FieldValues) => {
    const lines = conflicts
      .map((f) => `${FIELD_LABELS[f]}: now ${server[f] || "not set"} (you chose ${form[f] || "not set"})`)
      .join("\n");
    Alert.alert(
      "Changed since you opened Settings",
      `${lines}\n\nThis may have been changed by your teacher. Which should be kept?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Use Updated",
          onPress: () => {
            // Take the server's values for the conflicting fields and save nothing. Other edits
            // stay on screen, unsaved, for the user to review and save again.
            const nextForm = { ...form };
            const nextBase = { ...base };
            for (const f of conflicts) {
              nextForm[f] = server[f];
              nextBase[f] = server[f];
            }
            applyFields(nextForm);
            setBase(nextBase);
            refreshMe().catch(() => {});
          },
        },
        { text: "Keep Mine", style: "destructive", onPress: () => commitEdits(editedFields) },
      ]
    );
  };

  const saveProfile = async () => {
    setError("");
    // TEMP-DEBUG(profile-save) start
    console.log("[profile-save] tap", JSON.stringify({
      apiBase: API_BASE,
      workspaceId: activeWorkspaceId,
      role,
      base,
      form,
      editedFields,
    }));
    // TEMP-DEBUG(profile-save) end
    // Profiles are per-workspace, so there is nothing to save into until the class workspace
    // is known (a brand-new account in Public only, or an offline first launch).
    if (!activeWorkspaceId) {
      setError("No class workspace yet — your teacher needs to add you to a class first.");
      console.log("[profile-save] early return: no activeWorkspaceId"); // TEMP-DEBUG(profile-save)
      return;
    }
    if (!editedFields.length) {
      console.log("[profile-save] early return: nothing edited, no PATCH sent"); // TEMP-DEBUG(profile-save)
      router.replace("/");
      return;
    }
    setSaving(true);
    let server: FieldValues;
    try {
      // What the server holds now, not what the app last fetched. Saving needs the network
      // anyway, so a failure here is reported the same way a failed save would be.
      const me = await getMe();
      const membership: Membership | undefined = (me?.memberships || []).find(
        (m: Membership) => m.workspace_id === activeWorkspaceId
      );
      if (!membership) {
        console.log("[profile-save] early return: workspace not in /auth/me memberships"); // TEMP-DEBUG(profile-save)
        setError("You are no longer in this class. Pull down to refresh.");
        setSaving(false);
        return;
      }
      server = membershipFields(membership);
      console.log("[profile-save] server now", JSON.stringify(server)); // TEMP-DEBUG(profile-save)
    } catch (e: any) {
      console.log("[profile-save] early return: pre-save getMe failed", String(e?.message || e)); // TEMP-DEBUG(profile-save)
      setError(e?.message || "Could not check for changes. Check your connection and try again.");
      setSaving(false);
      return;
    }
    setSaving(false);
    // A conflict is an edited field whose stored value moved since it was loaded here, to
    // something other than what the user chose. (If it moved to the same value, there is nothing
    // to decide.)
    const conflicts = editedFields.filter((f) => server[f] !== base[f] && server[f] !== form[f]);
    if (conflicts.length) {
      console.log("[profile-save] conflict dialog, no PATCH yet", JSON.stringify(conflicts)); // TEMP-DEBUG(profile-save)
      askAboutConflicts(conflicts, server);
      return;
    }
    await commitEdits(editedFields);
  };

  const disconnectDevice = () => {
    Alert.alert("Disconnect Device", "Disconnect the current sensor?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await releaseDevice();
          // Only the device pairing is local now; the profile lives on the account.
          await AsyncStorage.removeItem("savedMacAddress").catch(() => {});
          Alert.alert("Done", "Device disconnected.");
        },
      },
    ]);
  };

  const readOnly = (label: string, value: string) => (
    <View key={label}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonlyBox}>
        <Text style={styles.readonlyText}>{value || "—"}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} />}
    >
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>
        {hasClassWorkspace
          ? "Your class details, synced to your account."
          : "You are not in a class yet."}
      </Text>

      {readOnly("Name", profile?.fullName || "")}

      {!hasClassWorkspace ? (
        // Only in the Public/school aggregates: nothing here is writable, and the backend rejects
        // uploads into those workspaces. Say so rather than showing a form that cannot save.
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No class yet</Text>
          <Text style={styles.emptyText}>
            Your teacher needs to invite you to a class before you can set a period and group or
            upload data. Once you have joined, pull down to refresh.
          </Text>
        </View>
      ) : (
        <>
          {/* Item 2: only meaningful with more than one class. */}
          {classMemberships.length > 1 ? (
            <View style={styles.section}>
              <Text style={styles.label}>Class workspace</Text>
              {classMemberships.map((m) => {
                const selected = m.workspace_id === activeWorkspaceId;
                return (
                  <TouchableOpacity
                    key={m.workspace_id}
                    style={[styles.wsRow, selected && styles.wsRowSelected]}
                    onPress={() => switchWorkspace(m.workspace_id)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.wsTextWrap}>
                      <Text style={[styles.wsName, selected && styles.wsNameSelected]}>
                        {m.workspace_name || "Untitled class"}
                      </Text>
                      {m.school_name ? <Text style={styles.wsSchool}>{m.school_name}</Text> : null}
                    </View>
                    {selected ? <Text style={styles.wsCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            readOnly("Class workspace", profile?.workspaceName || "")
          )}

          {/* School is a property of the class, not of the member: it comes from the schools
              directory via the teacher's Manage Classes setting on the web. Read-only for both
              roles — an editable field here would write user_profiles.school_code, which nothing
              displays or uploads. */}
          {readOnly("School", profile?.schoolName || "")}
          {!profile?.schoolName ? (
            <Text style={styles.hint}>
              Your teacher has not set this class&apos;s school yet. Data cannot be uploaded until
              they do.
            </Text>
          ) : null}

          {isTeacher ? (
            <>
              <Text style={styles.label}>Class (Instructor)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Mr. Smith"
                value={instructor}
                onChangeText={(t) => setInstructor(sanitizeName(t))}
                maxLength={60}
                editable={!saving}
              />
            </>
          ) : (
            readOnly("Class (Instructor)", profile?.instructor || "")
          )}

          {/* Item 4: options come from the workspace's class structure, not free text.
              Students only: a teacher has no period or group. */}
          {!isTeacher ? (
            <>
              <ChipPicker
                label="Period"
                options={structure?.periods ?? []}
                value={period}
                onChange={setPeriod}
                disabled={saving}
              />
              <ChipPicker
                label="Group"
                options={groupsFor(structure, period || structure?.periods[0] || "")}
                value={group}
                onChange={setGroup}
                disabled={saving}
              />
              {loadingStructure ? (
                <Text style={styles.hint}>Checking the latest class options…</Text>
              ) : null}
            </>
          ) : null}

          {!isTeacher ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                Your school and class name are set by your teacher. Pick the period and group you
                are working in — this is attached to every upload and cannot be changed afterwards.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.buttonPrimary, saving && styles.btnDisabled]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.buttonReset} onPress={disconnectDevice}>
        <Text style={styles.buttonResetText}>Disconnect Device</Text>
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
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 29,
    fontWeight: "bold",
    color: "#1a73e8",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    marginBottom: 32,
  },
  label: {
    fontSize: 17,
    color: "#333",
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    marginBottom: 20,
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  readonlyText: {
    fontSize: 17,
    color: "#555",
  },
  noteBox: {
    backgroundColor: "#e8f0fe",
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
  },
  section: { marginBottom: 20 },
  hint: { fontSize: 14, color: "#9aa0a6", marginBottom: 16 },
  wsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#eceff4",
    backgroundColor: "#f5f7fb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  wsRowSelected: { borderColor: "#1a73e8", backgroundColor: "#e8f0fe" },
  wsTextWrap: { flex: 1 },
  wsName: { fontSize: 17, fontWeight: "600", color: "#333" },
  wsNameSelected: { color: "#1a73e8" },
  wsSchool: { fontSize: 14, color: "#5f6368", marginTop: 2 },
  wsCheck: { fontSize: 20, color: "#1a73e8", fontWeight: "700" },
  emptyBox: {
    backgroundColor: "#fef7e0",
    borderRadius: 12,
    padding: 18,
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#8a6d1f", marginBottom: 6 },
  emptyText: { fontSize: 15, color: "#8a6d1f", lineHeight: 21 },
  noteText: {
    fontSize: 14,
    color: "#1a73e8",
    lineHeight: 20,
  },
  error: {
    color: "#c5221f",
    fontSize: 15,
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: "#1a73e8",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 19,
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
    fontSize: 19,
    fontWeight: "600",
  },
  back: {
    alignItems: "center",
    padding: 8,
  },
  backText: {
    color: "#1a73e8",
    fontSize: 17,
  },
});
