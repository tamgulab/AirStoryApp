import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { auth } from "./api/firebase";
import { getMe } from "./api/auth";

interface AuthContextType {
  /** Firebase is restoring the persisted session on launch. */
  initializing: boolean;
  /** Firebase user, or null when signed out. */
  user: User | null;
  /** Backend app account from /auth/me, or null. */
  me: any | null;
  /** Signed in to Firebase but the backend has no app account yet (route to onboarding). */
  needsOnboarding: boolean;
  /** A /auth/me fetch is in flight (used by the router gate to avoid premature redirects). */
  loadingMe: boolean;
  /** Re-fetch /auth/me (e.g. after onboarding or a profile change). */
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  initializing: true,
  user: null,
  me: null,
  needsOnboarding: false,
  loadingMe: false,
  refreshMe: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<any | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loadingMe, setLoadingMe] = useState(false);

  const refreshMe = useCallback(async () => {
    if (!auth.currentUser) {
      setMe(null);
      setNeedsOnboarding(false);
      return;
    }
    setLoadingMe(true);
    try {
      const data = await getMe();
      setMe(data);
      setNeedsOnboarding(false);
    } catch (e: any) {
      // A "no account" 401 means this Firebase user hasn't finished registration -> onboarding.
      // Any other error (e.g. transient network) leaves state untouched and will retry later.
      if (String(e?.message || "").toLowerCase().includes("no account")) {
        setMe(null);
        setNeedsOnboarding(true);
      }
    } finally {
      setLoadingMe(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setLoadingMe(true); // block the router gate until /auth/me resolves
        await refreshMe();
      } else {
        setMe(null);
        setNeedsOnboarding(false);
        setLoadingMe(false);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, [refreshMe]);

  return (
    <AuthContext.Provider value={{ initializing, user, me, needsOnboarding, loadingMe, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
