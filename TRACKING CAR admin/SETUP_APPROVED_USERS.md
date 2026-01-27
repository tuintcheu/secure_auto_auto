# Configuration des Utilisateurs Approuvés

## Vue d'ensemble

Le système a été mis en place pour permettre aux admins globaux d'ajouter des utilisateurs qui peuvent se connecter à l'app mobile TRACKING CAR. Seuls les utilisateurs approuvés peuvent utiliser l'application.

## Collecte de Données dans Firestore

### Collection: `approved_users`

Les utilisateurs approuvés sont stockés dans une collection Firestore appelée `approved_users` avec la structure suivante:

```json
{
  "firstName": "Léonce",
  "lastName": "Pharel",
  "matricule": "22v2343",
  "lieuAffectation": "Yaoundé",
  "email": "leoncepharel60@gmail.com",
  "phone": "+237XXXXXXXXX",
  "displayName": "Léonce Pharel",
  "createdAt": Timestamp,
  "createdBy": "admin_uid",
  "status": "approved",
  "active": true
}
```

## Fonctionnalités Admin

### 1. Ajouter un utilisateur manuellement

Page: `/users/add.html`

- Accès: Admins globaux uniquement
- Champs requis:
  - Prénom
  - Nom
- Champs optionnels:
  - Matricule
  - Lieu d'affectation
  - Email
  - Téléphone

### 2. Importer depuis Excel

Fichier Excel attendu (format):

| Prénom | Nom    | Matricule | Lieu d'affectation | Email          | Téléphone     |
| ------ | ------ | --------- | ------------------ | -------------- | ------------- |
| Léonce | Pharel | 22v2343   | Yaoundé            | user@gmail.com | +237XXXXXXXXX |

Le système accepte `.xlsx`, `.xls`, et `.csv`

## Intégration avec l'App Mobile

### Vérification lors de la connexion

Dans votre système d'authentification mobile (Firebase Auth), ajoutez une vérification:

```javascript
// Après l'authentification réussie
const user = await firebase.auth().signInWithEmailAndPassword(email, password);

// Vérifier si l'utilisateur est approuvé
const approvedUsersRef = firebase.firestore().collection("approved_users");
const snapshot = await approvedUsersRef.where("email", "==", email).get();

if (snapshot.empty) {
  // Utilisateur non approuvé
  await firebase.auth().signOut();
  throw new Error(
    "Accès refusé. Vous n'êtes pas autorisé à utiliser cette application."
  );
}

// Utilisateur approuvé - procéder
```

### Alternatives de vérification

Vous pouvez aussi utiliser l'une des méthodes suivantes:

#### Par affichage du nom

```javascript
const fullName = `${firstName} ${lastName}`;
const snapshot = await firebase
  .firestore()
  .collection("approved_users")
  .where("displayName", "==", fullName)
  .get();
```

#### Par matricule

```javascript
const snapshot = await firebase
  .firestore()
  .collection("approved_users")
  .where("matricule", "==", matricule)
  .get();
```

## Fonctions Utilitaires

Dans `utils.js`, deux fonctions sont disponibles:

### `TrackingCarUtils.isUserApproved(userIdentifier)`

Vérifie si un utilisateur est approuvé.

```javascript
const isApproved = await TrackingCarUtils.isUserApproved(
  "leoncepharel60@gmail.com"
);
```

### `TrackingCarUtils.getApprovedUserInfo(userIdentifier)`

Récupère les informations complètes d'un utilisateur approuvé.

```javascript
const userInfo = await TrackingCarUtils.getApprovedUserInfo(
  "leoncepharel60@gmail.com"
);
console.log(userInfo.firstName, userInfo.lastName, userInfo.matricule);
```

## Flux d'authentification Recommandé

```
1. Utilisateur entre ses identifiants dans l'app mobile
2. Authentification Firebase standard (email/password)
3. Vérifier dans la collection approved_users
4. Si approuvé → Accès accordé
5. Si non approuvé → Déconnexion + message d'erreur
6. Créer un enregistrement utilisateur/profile avec les infos
```

## Gestion des Utilisateurs

### Lister les utilisateurs approuvés

La page `/users/list.html` affiche maintenant les utilisateurs approuvés et ceux qui se sont connectés.

### Désactiver un utilisateur

Modifier le champ `active` à `false` dans Firestore:

```javascript
await firebase
  .firestore()
  .collection("approved_users")
  .doc(documentId)
  .update({ active: false });
```

### Mettre à jour les infos d'un utilisateur

```javascript
await firebase.firestore().collection("approved_users").doc(documentId).update({
  firstName: "Nouveau Prénom",
  lastName: "Nouveau Nom",
  matricule: "NOUVEAU123",
  lieuAffectation: "Douala",
});
```

## Export des Données

Le système génère automatiquement des statistiques:

- Total utilisateurs approuvés
- Utilisateurs ajoutés aujourd'hui
- Liste des utilisateurs récemment ajoutés

## Sécurité

### Règles Firestore Recommandées

```javascript
// Pour la collection approved_users
match /approved_users/{document=**} {
    // Lecture: admins uniquement ou utilisateur authentifié et approuvé
    allow read: if request.auth != null && (
        isAdminGlobal(request.auth.uid) ||
        document.get('email') == request.auth.token.email
    );

    // Écriture: admins globaux uniquement
    allow create, update, delete: if isAdminGlobal(request.auth.uid);
}

function isAdminGlobal(uid) {
    return get(/databases/$(database)/documents/admin_users/$(uid)).data.role == 'global_admin';
}
```

## Changelog

- **v1.0**: Mise en place du système d'utilisateurs approuvés
  - Ajout manuel d'utilisateurs
  - Import Excel
  - Vérification de l'approbation
