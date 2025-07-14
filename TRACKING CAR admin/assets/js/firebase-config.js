import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAOS5eDHnRXGXn4QpkOqm3z0kcChSlU0Ho",
    authDomain: "securauto-19756.firebaseapp.com",
    projectId: "securauto-19756",
    storageBucket: "securauto-19756.appspot.com",
    messagingSenderId: "42127478765",
    appId: "1:42127478765:web:7800e4c81932e9af4561e4",
    measurementId: "G-3Q2KNVXZPS"
};

// Initialisation Firebase
let app;
try {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase initialisé pour TRACKING CAR');
} catch (error) {
    console.error('❌ Erreur initialisation Firebase:', error);
}

// Initialisation des services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Activer la persistance hors ligne
enableIndexedDbPersistence(db)
    .catch((err) => {
        console.warn('⚠️ Erreur persistance Firebase:', err.code);
    });

// Configuration globale
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseStorage = storage;

console.log('📊 Configuration TRACKING CAR chargée');
