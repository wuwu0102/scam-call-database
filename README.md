# scam-call-database

Cross-platform anti-scam caller ID planning repository with a working GitHub Pages web/PWA, shared seed data, and side project scaffolds for Flutter/iOS/Android.

## Project structure

- **Web/PWA**
  - root `index.html`
  - root `manifest.json`
- **Shared data**
  - `data/mexico_seed_phone_numbers.json`
- **Firebase**
  - Firestore collection `phone_numbers`
- **Flutter app**
  - `side_projects/flutter-phone-lookup-app`
- **iPhone caller ID**
  - `side_projects/ios-phone-callerid`
- **Android future caller ID**
  - `side_projects/android-callerid`

## Web/PWA lookup behavior

Lookup order is:
1. Firestore collection `phone_numbers`
2. `data/mexico_seed_phone_numbers.json`
3. fallback `scam_numbers.json`
4. unknown result

The report form still writes to Firestore collection `phone_numbers`.

## Shared Mexico seed database

- Seed file: `data/mexico_seed_phone_numbers.json`
- Source references: `data/mexico_seed_sources.md`
- Shared schema: `data/schema.md`
- Normalization helper: `data/normalize_phone.js`

## Firestore admin docs

- `admin/README.md`
- `admin/import_mexico_seed_to_firestore.md`
- `admin/firestore_fields.md`

These explain manual import for required fields in `phone_numbers`.

## Roadmap

### Phase 1
Web/PWA + Firebase + Mexico seed DB

### Phase 2
Flutter app for iPhone/Android normal app lookup/report

### Phase 3
iOS Call Directory Extension for incoming-call display

### Phase 4
Android native caller ID/call screening

### Phase 5
Automated Mexico source update pipeline

## Important platform notes

- iOS real incoming-call caller ID requires native iOS Call Directory Extension, Xcode, Apple signing, and real device testing.
- Android incoming-call caller ID requires native Android call screening/caller-ID integration and policy review.
- This repository does not claim App Store/Play Store build verification in this environment.

## GitHub Actions: iOS caller ID export

This repository includes `.github/workflows/export-ios-numbers.yml` to export `data/ios_numbers.json` from Firestore on every push to `main` (and via manual `workflow_dispatch`).

### Required GitHub Secret

Set the repository secret `FIREBASE_SERVICE_ACCOUNT_JSON` to a valid Firebase service account JSON string.

- The workflow writes this secret to a temporary file at runtime.
- The script reads credentials from `GOOGLE_APPLICATION_CREDENTIALS`.
- Do **not** hardcode credentials in the repository.

## Import Mexico seed data to Firestore

Use `scripts/import_mexico_seed_to_firestore.js` to import records from `data/mexico_seed_phone_numbers.json` into Firestore collection `phone_numbers`.

### GitHub Secret required

- `FIREBASE_SERVICE_ACCOUNT_JSON`

### Local command

```bash
node scripts/import_mexico_seed_to_firestore.js --dry-run
node scripts/import_mexico_seed_to_firestore.js
```

## Mexico phone database strategy

- Official sources are imported as high/medium confidence seed records.
- Community sources require manual review before merge.
- Firebase user reports are not automatically trusted.
- iOS caller ID export uses only reviewed `scam`/`suspicious` records.
- Automation command:

```bash
node scripts/merge_seed_database.js
```
