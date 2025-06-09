# Guide de configuration Firebase pour SecurAuto Admin

## 1. Création du projet Firebase

1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Créer un nouveau projet : "securAuto-cameroon"
3. Activer Google Analytics (optionnel)

## 2. Configuration Authentication

1. Aller dans Authentication > Sign-in method
2. Activer "Email/Password"
3. Configurer les domaines autorisés

## 3. Configuration Firestore

### Collections à créer :

#### `admin_users`
```javascript
{
  uid: "string", // ID Firebase Auth
  email: "string",
  displayName: "string",
  role: "super_admin" | "regional_admin" | "legion_admin",
  region: "string", // Code région (RG1, RG2, etc.)
  legion: "string", // Code légion (CENTRE, LITTORAL, etc.)
  isActive: boolean,
  createdAt: timestamp,
  lastLogin: timestamp,
  lastLoginIP: "string"
}