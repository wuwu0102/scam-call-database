# iPhone Caller ID MVP (Call Directory Extension)

This side project is a native iOS scaffold for caller identification using **Apple Call Directory Extension**. It is intentionally isolated from the existing web app and lives entirely under:

- `side_projects/ios-phone-callerid/`

## What this side project is

- A host iOS app scaffold (SwiftUI) with controls to:
  - check extension status
  - reload extension data
  - copy bundled sample JSON into an App Group shared container
- A Call Directory Extension scaffold that:
  - loads JSON from App Group shared storage if present
  - falls back to bundled sample JSON
  - parses, validates, deduplicates, sorts numbers ascending
  - feeds entries to iOS with `addIdentificationEntry`

## Apple feature used in this MVP

This MVP uses:

- **CallKit Call Directory Extension** (`com.apple.callkit.call-directory`)

This is the supported Apple mechanism for offline number identification labels shown during incoming calls.

## Why web/PWA cannot do this on iPhone

A web app/PWA cannot register a native iOS Call Directory provider, cannot access CallKit extension points, and cannot inject caller-ID labels into the Phone app call UI. This requires a signed native iOS app + extension pair in Xcode with Apple entitlements.

## Project layout

- `phone_numbers_sample.json` — bundled fallback phone data sample.
- `app_source/` — host app Swift source files.
- `extension_source/` — Call Directory extension Swift source files.
- `ios_project_blueprint/` — Info.plist + entitlements templates and identifier placeholders.

## Xcode setup (exact steps)

> Build/signing must be done in Xcode on macOS with an Apple Developer team.

1. **Create host app project**
   - Open Xcode → New Project → iOS App.
   - Product Name: `ScamCallerID`.
   - Interface: SwiftUI, Language: Swift.
   - Set Team to your Apple Developer Team.

2. **Set host app bundle ID**
   - Target `ScamCallerID` → Signing & Capabilities.
   - Replace bundle identifier placeholder with your value, e.g.:
     - `com.wuwu0102.scamcall`

3. **Add Call Directory Extension target**
   - File → New → Target → Call Directory Extension.
   - Suggested name: `ScamCallerIDCallDirectoryExtension`.
   - Set extension bundle ID, e.g.:
     - `com.wuwu0102.scamcall.CallDirectoryExtension`

4. **Configure App Group for both targets**
   - Add capability: **App Groups** on host target and extension target.
   - Add shared group ID:
     - `group.com.wuwu0102.scamcall` (replace with your real value if needed).

5. **Copy source files into targets**
   - Host app target files:
     - `app_source/ScamCallerIDApp.swift`
     - `app_source/ContentView.swift`
     - `app_source/CallDirectoryStatusManager.swift`
     - `app_source/CallDirectoryReloadManager.swift`
     - `app_source/SharedPhoneNumberStore.swift`
   - Extension target files:
     - `extension_source/CallDirectoryHandler.swift`
     - `extension_source/PhoneNumberRecord.swift`
     - `extension_source/PhoneNumberParser.swift`
     - `extension_source/ExtensionConstants.swift`

6. **Apply plist/entitlements templates (optional but recommended)**
   - Use templates from `ios_project_blueprint/`:
     - `HostApp-Info.plist`
     - `CallDirectoryExtension-Info.plist`
     - `HostApp.entitlements`
     - `CallDirectoryExtension.entitlements`
   - Ensure `NSExtensionPointIdentifier` is `com.apple.callkit.call-directory` in extension plist.

7. **Include JSON resources in both targets**
   - Add `phone_numbers_sample.json` to the project navigator.
   - Ensure target membership includes:
     - Host app target
     - Extension target

8. **Replace all placeholders**
   - In code and settings, replace:
     - Team ID placeholder
     - Host bundle ID placeholder
     - Extension bundle ID placeholder
     - App Group ID placeholder
   - Quick checklist file:
     - `ios_project_blueprint/BundleIdentifiers.example.txt`

9. **Run on real device**
   - Build and run host app on iPhone.
   - Tap “Import bundled sample JSON into shared app group”.
   - Tap “Reload caller ID database”.

10. **Enable extension on iPhone**
    - Open iPhone Settings and navigate:
      - **Settings → Apps → Phone → Call Blocking & Identification**
    - Enable your extension toggle (e.g., “Scam Caller ID”).

## Manual testing steps (real iPhone)

1. Install host app + extension via Xcode on iPhone.
2. Open host app, verify status message appears.
3. Tap import button to write JSON to shared App Group container.
4. Tap reload button.
5. Enable extension in iPhone settings path above.
6. Return to app, tap refresh status; it should show enabled.
7. Place test calls from numbers matching sample JSON and verify identification labels appear.

## Data rules implemented

- Input JSON model: array of `{ number, label }`.
- `number` must be positive integer-style E.164 digits without `+`.
- Empty labels are skipped.
- Duplicate numbers are deduplicated (latest value wins).
- Entries are sorted ascending before `addIdentificationEntry` calls.

## Known limitations (MVP)

- Local/offline list only (no live cloud lookup).
- User must manually enable extension in iPhone Settings.
- Caller ID updates require extension reload.
- This scaffold is not build-verified in this environment (Xcode not available here).

## Next-phase upgrade path

1. Add Firebase export job that produces the same JSON schema.
2. Import/export pipeline writes new `phone_numbers.json` into App Group container.
3. Trigger extension reload after updates.
4. Scale offline dataset with chunking and validation tooling.
5. Later evaluate migration to Apple Live Caller ID Lookup as a separate phase.
