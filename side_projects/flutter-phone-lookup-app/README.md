# Flutter Phone Lookup App (Cross-Platform UI Plan)

This folder contains a Flutter app scaffold intended for a normal iPhone/Android app lookup and report UI.

## Scope of this Flutter app

- Cross-platform lookup/report interface for iPhone and Android.
- Uses Firestore collection `phone_numbers` (same shared collection as web/PWA).
- Supports tag values: `scam`, `suspicious`, `safe`, `unknown`.

## Important limitations

- This Flutter app **does NOT by itself** create iPhone incoming-call caller ID.
- iPhone incoming-call caller ID requires the native iOS Call Directory Extension scaffold in `side_projects/ios-phone-callerid`.
- Android incoming-call caller ID/screening requires native Android integration later.

## Shared-data direction

- This Flutter app should continue to consume the same Firestore collection: `phone_numbers`.
- Shared schema is documented in `data/schema.md`.
- Mexico seed records can be imported to Firestore and become immediately queryable by this app.

## Current features in scaffold

- Search phone number from Firestore.
- Report phone number to Firestore.
- Two tabs: **Search phone** and **Report phone**.
- Service layer (`lib/services/firestore_service.dart`) for future expansion.

## Packages

Defined in `pubspec.yaml`:
- `firebase_core`
- `cloud_firestore`

## How to run

1. Install Flutter SDK and platform toolchains.
2. In this folder run:
   ```bash
   flutter pub get
   flutter run
   ```

## Firebase setup (manual)

You must add your own Firebase config files from your Firebase project:

- Android: `android/app/google-services.json`
- iOS: `ios/Runner/GoogleService-Info.plist`

Then complete standard Firebase Flutter setup for Android/iOS and ensure Firestore is enabled.
