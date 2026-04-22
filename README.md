# scam-call-database

## Firestore-backed phone lookup (GitHub Pages friendly)

This app is still a plain static frontend (`index.html` + `scam_numbers.json`) and now reads/writes phone data from Firebase Firestore collection `phone_numbers` using the Firebase Web SDK CDN modules.

### What changed
- Lookup now checks Firestore collection `phone_numbers` first.
- Report form now writes directly to Firestore `phone_numbers`.
- Existing JSON data (`scam_numbers.json`) remains as fallback if Firestore is unavailable.
- No npm/build/backend is required, so GitHub Pages deployment still works.

### Firestore collection and fields

Collection:
- `phone_numbers`

Document fields currently read/written:
- `number` (string)
- `normalizedNumber` (string, added by this app for faster matching)
- `tag` (string; supports `scam` / `safe` / `unknown`, can display other tags too)
- `lang` (string)
- `note` (string)
- `createdAt` (number timestamp)

### 🔥 REQUIRED: Firestore Rules Setup

To enable frontend read/write access for this GitHub Pages app:

1. Go to **Firebase Console**.
2. Open **Firestore Database**.
3. Click **Rules**.
4. Paste the exact rules below.
5. Click **Publish**.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /phone_numbers/{document} {
      allow read, write: if true;
    }

  }
}
```

> Important: the above rule is open and intended only for MVP/testing. Tighten rules before production.
