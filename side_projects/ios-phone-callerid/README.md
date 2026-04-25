# iPhone Caller ID Path (Call Directory Extension)

This folder is the real iPhone incoming-call caller ID path and is intentionally iOS-only.

- Path: `side_projects/ios-phone-callerid/`
- Core Apple API: **CallKit Call Directory Extension**

## What this project is for

- Native iOS caller ID display for incoming calls.
- Host iOS app + Call Directory Extension scaffold.
- Offline MVP that reads bundled caller ID data from `ios_numbers.json`.

## Important requirements

This cannot be completed in a GitHub-only environment. It requires:

- macOS + Xcode
- Apple Developer signing/capabilities
- real iPhone device testing

## Data source used by this scaffold

- Canonical exported file: `data/ios_numbers.json` (at repo root).
- Bundle file name expected by both host app and extension: `ios_numbers.json`.
- JSON shape expected:
  ```json
  [
    { "number": 12025550123, "label": "Scam Likely" }
  ]
  ```
- Runtime behavior:
  - Extension first loads `ios_numbers.json` from shared App Group container.
  - If missing, extension falls back to bundled `ios_numbers.json`.

## Included scaffold folders

- `app_source/`
- `extension_source/`
- `ios_project_blueprint/`

## Xcode setup (manual)

1. **Open the iOS project in Xcode**
   - Open/create the host app + Call Directory Extension project for this scaffold path.
2. **Add exported caller ID JSON into the app bundle**
   - In Finder, locate `data/ios_numbers.json`.
   - Drag `data/ios_numbers.json` into Xcode.
   - Ensure target membership includes:
     - Host app target
     - Call Directory Extension target
   - Keep file name exactly: `ios_numbers.json`.
3. **Enable App Groups capability**
   - For both targets, enable **Signing & Capabilities > App Groups**.
   - Use the same group ID in both targets (for example: `group.com.wuwu0102.scamcall`).
   - Match that value with `appGroupIdentifier` constants in scaffold Swift files.
4. **Enable Call Directory Extension**
   - Confirm the extension target uses the Call Directory Extension template/plist.
   - Confirm extension bundle identifier matches the host app reload manager value.
5. **Run on a real iPhone**
   - Build/install host app and extension to a physical iPhone (simulator is insufficient for real incoming caller ID behavior).
6. **Enable in iPhone settings**
   - On iPhone go to:
     - `Settings > Phone > Call Blocking & Identification`
   - Enable your Call Directory extension toggle (for example, “Scam Caller ID”).

## MVP scope constraints

- Offline bundled JSON only.
- No login.
- No background sync.
- No server sync.

## Manual test flow (exact)

1. Validate JSON format locally before bundling:
   - `python3 -m json.tool data/ios_numbers.json > /dev/null`
2. Install and run host app on iPhone from Xcode.
3. In host app, tap **Import bundled ios_numbers.json into shared app group**.
4. Tap **Reload caller ID database**.
5. Open iPhone settings and ensure extension is enabled:
   - `Settings > Phone > Call Blocking & Identification`
6. Place a test call from a number contained in `ios_numbers.json`.
7. Confirm incoming call UI shows the configured label.

## Scope note

This repository task only maintains and documents the iOS caller ID scaffold path.
It does **not** claim App Store build or end-to-end iPhone caller-ID verification.
