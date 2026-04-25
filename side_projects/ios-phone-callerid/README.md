# iPhone Caller ID Path (Call Directory Extension)

This folder is the real iPhone incoming-call caller ID path and is intentionally iOS-only.

- Path: `side_projects/ios-phone-callerid/`
- Core Apple API: **CallKit Call Directory Extension**

## What this project is for

- Native iOS caller ID display for incoming calls.
- Host iOS app + Call Directory Extension scaffold.
- Local data ingestion flow that can later consume exported JSON from Firestore.

## Important requirements

This cannot be completed in a GitHub-only environment. It requires:

- macOS + Xcode
- Apple Developer signing/capabilities
- real iPhone device testing

## Data compatibility guidance

- Future export/import should use shared records originating from Firestore `phone_numbers`.
- `normalizedNumber` should be integer digits without `+`.
- Numbers should be sorted ascending and deduplicated before extension load.

## Included scaffold folders

- `app_source/`
- `extension_source/`
- `ios_project_blueprint/`
- `phone_numbers_sample.json`

## Scope note

This repository task only maintains and documents the iOS caller ID scaffold path.
It does **not** claim App Store build or end-to-end iPhone caller-ID verification.
