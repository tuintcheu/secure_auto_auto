/**
 * Configuration Firebase pour SecurAuto Admin
 * IMPORTANT: Ne jamais exposer les clés privées côté client
 */

// Configuration Firebase - Remplacez par vos vraies valeurs
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAOS5eDHnRXGXn4QpkOqm3z0kcChSlU0Ho",
  authDomain: "securauto-19756.firebaseapp.com",
  projectId: "securauto-19756",
  storageBucket: "securauto-19756.firebasestorage.app",
  messagingSenderId: "42127478765",
  appId: "1:42127478765:web:7800e4c81932e9af4561e4",
  measurementId: "G-3Q2KNVXZPS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Services Firebase
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
 analytics = firebase.analytics ? firebase.analytics() : null;

// Configuration de Firestore
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Activer la persistance hors ligne
db.enablePersistence()
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Persistance Firebase: Plusieurs onglets ouverts');
        } else if (err.code == 'unimplemented') {
            console.warn('Persistance Firebase: Non supportée par ce navigateur');
        }
    });

export { auth, db, storage, analytics };