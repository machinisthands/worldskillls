// Firebase app + auth (Google sign-in) for the comments → js/vendor/firebase-auth.min.js
// Rebuild: npm i firebase@13.4.0 esbuild && npx esbuild scripts/firebase-entry.js --bundle --minify --format=iife --target=es2019 --legal-comments=eof --outfile=js/vendor/firebase-auth.min.js
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, browserPopupRedirectResolver, initializeAuth, browserLocalPersistence } from 'firebase/auth';
window.MH_FB = { initializeApp, initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut };
