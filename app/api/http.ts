import { auth } from "./firebase";

// The backend mounts routes under `/api/...`, so the base must end at `/api`. On a phone there is
// no window.location, so we default to the deployed Render API. Override for local backend testing
// with EXPO_PUBLIC_API_BASE_URL (e.g. http://192.168.1.56:4000 — your Mac's LAN IP, not localhost).
const DEFAULT_API_BASE = "https://air-sensor-api.onrender.com/api";

function normalizeApiBase(raw?: string): string {
  const u = (raw || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
  return u.endsWith("/api") ? u : `${u}/api`;
}

export const API_BASE = normalizeApiBase(process.env.EXPO_PUBLIC_API_BASE_URL);

/**
 * Current Firebase ID token, or null when signed out. The Firebase SDK caches and refreshes the
 * token automatically, so getIdToken() returns a valid (~1 hr) token without our own refresh logic.
 */
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function apiRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getIdToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Network error — could not reach the AirStory server. Check your connection.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}
