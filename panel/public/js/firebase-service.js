// Firebase Client Service using Firebase v10 Modular SDK via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

let app = null;
let auth = null;
let isConfigured = false;
let configData = null;

export const FirebaseService = {
  async init() {
    if (isConfigured) return { app, auth, config: configData };

    try {
      const res = await fetch("/api/auth/config");
      const json = await res.json();
      configData = json.data;

      if (!configData || !configData.apiKey) {
        console.warn("[Firebase] No client config available");
        return null;
      }

      app = initializeApp(configData);
      auth = getAuth(app);
      isConfigured = true;
      return { app, auth, config: configData };
    } catch (err) {
      console.error("[Firebase] Init error:", err);
      return null;
    }
  },

  isReady() {
    return isConfigured && !!auth;
  },

  getAuth() {
    return auth;
  },

  getConfig() {
    return configData;
  },

  // Google Sign-In with Firebase Auth
  async signInWithGoogle() {
    await this.init();
    if (!auth) throw new Error("Firebase Auth is not initialized");

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const idToken = await user.getIdToken(true);

    const profile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split("@")[0] || "Administrator",
      photoURL: user.photoURL || null,
      idToken
    };

    return { user, idToken, profile };
  },

  async signOut() {
    if (auth) {
      try {
        await fbSignOut(auth);
      } catch (e) {
        console.warn("[Firebase] SignOut warning:", e);
      }
    }
  }
};
