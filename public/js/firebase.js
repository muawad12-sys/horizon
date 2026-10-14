// Firebase core (app + Firestore) loaded straight from the CDN — no build step.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';

export * from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export const useEmulators = firebaseConfig.projectId.startsWith('demo-');
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

if (useEmulators) connectFirestoreEmulator(db, location.hostname, 8080);
