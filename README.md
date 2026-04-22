# scam-call-database

## Firebase Firestore setup (GitHub Pages friendly)

This project now reads/writes crowd reports from Firestore collection `phone_reports`.

### 1) Create Firebase project
1. Go to Firebase Console.
2. Create a new project.
3. Add a **Web app** in Project Settings.
4. Copy the Firebase web config fields.

### 2) Enable Firestore
1. In Firebase Console, open **Firestore Database**.
2. Create database (start in test mode for MVP if needed).
3. Keep collection name as `phone_reports`.

Document fields used by this site:
- `phoneOriginal` (string)
- `phoneNormalized` (string)
- `label` (`scam` / `safe` / `unknown`)
- `createdAt` (number timestamp)
- `source` (`web`)
- `lang` (`zh-TW` / `en` / `es-MX`)

### 3) Create `firebase-config.js`
1. Copy `firebase-config.example.js` to `firebase-config.js`.
2. Replace placeholder values with your own Firebase config.
3. Keep `firebase-config.js` in repo root next to `index.html`.

Example command:

```bash
cp firebase-config.example.js firebase-config.js
```

### 4) Deploy safely on GitHub Pages
- Do not commit private backend secrets (none are required for this MVP).
- Firebase web config is public app config, but still use your real project values only in `firebase-config.js`.
- Make sure Firestore security rules are set intentionally before production launch.
- Push `index.html`, `scam_numbers.json`, and your Firebase config file with your Pages deployment flow.
