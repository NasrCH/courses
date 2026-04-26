# 🛒 Courses Duo — Guide Notifications Push (Cloudflare Workers)

## Architecture — 100% gratuit ✅

```
📱 Téléphone A (ajoute un article)
        │
        ├──► 🔥 Firestore  ──────────────────────────────────► 📱 Téléphone B
        │     (sync live,                                         (onSnapshot → toast
        │      onSnapshot)                                         si app ouverte)
        │
        └──► ⚡ Cloudflare Worker  ──► 📡 FCM  ──────────────► 📱 Téléphone B
              (HTTP POST gratuit)                                  (notif push même
                                                                   app fermée !)
```

| Service | Limite gratuite |
|---------|----------------|
| Cloudflare Workers | 100 000 req/jour |
| Firebase Firestore | 50 000 lectures, 20 000 écritures/jour |
| FCM (notifications) | Illimité |

---

## Déploiement du Cloudflare Worker

### 1. Installer Wrangler (CLI Cloudflare)
```bash
npm install -g wrangler
wrangler login
```

### 2. Obtenir le Service Account Firebase
1. Aller sur [Firebase Console](https://console.firebase.google.com) → projet **misfit-game**
2. ⚙️ Paramètres du projet → **Comptes de service**
3. Cliquer sur **Générer une nouvelle clé privée**
4. Télécharger le fichier JSON — il contient :
   - `client_email` → c'est **SERVICE_ACCOUNT_EMAIL**
   - `private_key` → c'est **SERVICE_ACCOUNT_PRIVATE_KEY**

### 3. Configurer les secrets (ne jamais les mettre dans le code !)
```bash
cd cloudflare-worker

# Entrer l'email du service account quand demandé
wrangler secret put SERVICE_ACCOUNT_EMAIL

# Coller la clé privée en entier (avec les "-----BEGIN PRIVATE KEY-----")
wrangler secret put SERVICE_ACCOUNT_PRIVATE_KEY
```

### 4. Déployer
```bash
wrangler deploy
```
> Cloudflare affiche l'URL : `https://courses-duo-notifications.TON_COMPTE.workers.dev`

### 5. Mettre l'URL dans l'app
Dans **`index.html`**, ligne `WORKER_URL` :
```javascript
const WORKER_URL = "https://courses-duo-notifications.TON_COMPTE.workers.dev";
```

---

## Activer les notifications sur chaque téléphone

1. Ouvrir l'app sur **chaque** téléphone
2. Cliquer sur **"🔕 Activer les notifs"** en haut à droite
3. Accepter la permission
4. ✅ Le token FCM est enregistré dans Firestore (`fcm_tokens/{deviceId}`)

---

## Comportement selon l'état de l'app

| État de l'app | Notification reçue par l'autre |
|---------------|-------------------------------|
| App **ouverte** | Toast dans l'app + notification système |
| App **minimisée** (background) | Notification système |
| App **complètement fermée** | Notification push via Worker + FCM ✅ |

---

## Règles Firestore (Firebase Console → Firestore → Règles)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /courses/{document=**} {
      allow read, write: if true;
    }
    match /fcm_tokens/{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

## Résumé des fichiers

```
cloudflare-worker/
  worker.js       ← Le Worker (logique de notification)
  wrangler.toml   ← Config de déploiement

index.html        ← WORKER_URL à renseigner après déploiement
sw.js             ← Reçoit les push FCM en arrière-plan
```
