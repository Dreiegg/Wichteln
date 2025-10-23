// Firebase web config adapted for the Wichteln app.
// This file sets `window.firebaseConfig` so the app can detect and
// initialize Firestore when loaded in the browser. Keep this file
// next to `index.html`.

window.firebaseConfig = {
  apiKey: "AIzaSyBzCw2pXw1tiKO37C8L4RNbGtCLPzbPxvE",
  authDomain: "wichteln-6fe74.firebaseapp.com",
  projectId: "wichteln-6fe74",
  storageBucket: "wichteln-6fe74.firebasestorage.app",
  messagingSenderId: "132048455187",
  appId: "1:132048455187:web:cbd687d047e6827f5ce1e6"
};

// Optional: Organizer secret (nur lokal oder in privatem Repo). Wenn gesetzt,
// ermöglicht es die sichere Erstellung von Admin-Accounts (clients müssen
// das Secret zum Registrieren angeben). Beispiel:
// window.organizerSecret = 'meingeheimespasswort123';

window.organizerSecret = null;
