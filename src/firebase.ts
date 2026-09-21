import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAcrEo6UQaQOJ588RLDj3dT2aR_-sZ09Ms',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'fluxoprov2.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'fluxoprov2',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'fluxoprov2.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '959429724064',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:959429724064:web:6128b4dec32cdef2fec6c5',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });

