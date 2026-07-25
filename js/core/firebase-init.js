// js/firebase-init.js

const firebaseConfig = {
  apiKey: "AIzaSyAcrEo6UQaQOJ588RLDj3dT2aR_-sZ09Ms",
  authDomain: "fluxoprov2.firebaseapp.com",
  projectId: "fluxoprov2",
  storageBucket: "fluxoprov2.firebasestorage.app",
  messagingSenderId: "959429724064",
  appId: "1:959429724064:web:6128b4dec32cdef2fec6c5"
};

// Initialize Firebase (Compat SDK for Vanilla JS)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  
  // Enable offline persistence for Firestore
  firebase.firestore().enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Multiplas abas abertas, persistencia offline ativada apenas na primeira aba.');
        } else if (err.code == 'unimplemented') {
            console.warn('Navegador atual nao suporta persistencia offline.');
        }
    });
}