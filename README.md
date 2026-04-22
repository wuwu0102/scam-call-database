# scam-call-database

## Project structure

This repository now contains:
- A **working static web app** for GitHub Pages (`index.html` + `scam_numbers.json`)
- A **Flutter app starter** at `side_projects/flutter-phone-lookup-app`

## Static web app (GitHub Pages friendly)

The existing web app remains plain static frontend and still works on GitHub Pages without npm/build/backend.

### Web lookup/report behavior
- Lookup checks Firestore collection `phone_numbers` first.
- Report writes directly to Firestore collection `phone_numbers`.
- JSON file `scam_numbers.json` remains the fallback source if Firestore is unavailable.
- Phone normalization and matching behavior are preserved.

### Web UI upgrade
- Improved mobile-first card spacing/readability.
- Search result now shows colored status card:
  - `scam` = red
  - `suspicious` = orange
  - `safe` = green
  - `unknown` = gray
- Optional note is shown below the result if present.
- Save/report feedback now shows clearer success/error messages.

## Flutter app starter

Path:
- `side_projects/flutter-phone-lookup-app`

Includes:
- Search phone screen
- Report phone screen
- Firestore service using same collection: `phone_numbers`
- Basic phone normalization utility
- README with setup steps and Firebase file placement instructions

> This is a skeleton only (no native caller-ID / CallKit / Android call screening integration yet).

## Firestore collection and fields

Collection:
- `phone_numbers`

Document fields currently read/written:
- `number` (string)
- `normalizedNumber` (string)
- `tag` (string; supports `scam` / `suspicious` / `safe` / `unknown`, can display other tags too)
- `lang` (string)
- `note` (string)
- `createdAt` (number timestamp)

## 🔥 REQUIRED: Firestore Rules Setup

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
