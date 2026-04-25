# Import Mexico Seed into Firestore (`phone_numbers`)

## Goal
Load records from `data/mexico_seed_phone_numbers.json` into Firestore collection `phone_numbers` without changing schema compatibility.

## Manual import steps
1. Open Firebase Console for your project.
2. Go to **Firestore Database**.
3. Open collection: `phone_numbers`.
4. For each record in `data/mexico_seed_phone_numbers.json`, click **Add document**.
5. Use either auto-ID or a deterministic doc ID (for example `normalizedNumber`).
6. Copy all required fields exactly as listed in `admin/firestore_fields.md`.
7. Save the document.

## Notes
- Keep `normalizedNumber` as digits only.
- Keep `country` as `MX` for this seed set.
- Keep tags in allowed set: `scam`, `suspicious`, `safe`, `unknown`.
- Keep confidence aligned with source type:
  - official => high
  - crowd_report => medium
- Do not add unverified numbers.
