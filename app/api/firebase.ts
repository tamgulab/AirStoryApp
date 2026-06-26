import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
// getReactNativePersistence ships in the firebase/auth React Native build (dist/rn), which
// Metro resolves at runtime. The public type defs omit it, so the ts-ignore is expected.
// @ts-ignore
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

// Firebase Web config for the shared "airstory-web" project — the SAME project the web app
// uses, which is what makes one account work across web and phone. These values are not
// secrets (they identify the project; access is enforced by Firebase Auth + backend). They can
// be overridden per-environment via EXPO_PUBLIC_FIREBASE_* without code changes.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyBKX-eZ3_ucOv0M3qiRISvBr9iXV1VlpY0",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "airstory-web.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "airstory-web",
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "airstory-web.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "1037413883094",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "1:1037413883094:web:99e4ea3207b6146ae07d77",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth wires AsyncStorage persistence so the session survives app restarts. It may
// only run once per app; on Fast Refresh re-imports it throws "already-initialized", so we fall
// back to the existing instance via getAuth.
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
