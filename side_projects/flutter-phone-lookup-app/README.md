# Flutter Phone Lookup App (Skeleton)

This folder contains a minimal Flutter starter app that uses Firebase + Firestore collection `phone_numbers` (same collection as the static web app).

## Scope in this skeleton
- Search phone number from Firestore
- Report phone number to Firestore
- Two tabs: **Search phone** and **Report phone**
- Service layer (`lib/services/firestore_service.dart`) to keep room for future caller-ID features

## Packages
Add with `pubspec.yaml` (already included):
- `firebase_core`
- `cloud_firestore`

## How to run
1. Install Flutter SDK and platform toolchains.
2. In this folder, run:
   ```bash
   flutter pub get
   flutter run
   ```

## Firebase setup you still need to do manually
This repo does **not** include real Firebase platform config files.

You must add your own files generated from your Firebase project (`phone-lookup-app-f8f33`):

- Android: `android/app/google-services.json`
- iOS: `ios/Runner/GoogleService-Info.plist`
- (Optional for desktop/web): add corresponding configs and update init flow.

Then follow standard Firebase Flutter setup:
- Add Firebase apps for Android/iOS in Firebase Console.
- Configure native Gradle/Xcode Firebase integration.
- Ensure Firestore is enabled and uses collection `phone_numbers`.

## Notes for future caller-ID app extension
Current code keeps search/report logic in `FirestoreService`. This makes it easier to later add:
- call event ingestion
- caller-ID overlay logic
- local cache/blocklist sync
without rewriting UI screens.
