# Mexico scam-number automation model

## Phase 1: curated official seed data
- Store curated Mexico seed records in `data/mexico_seed_phone_numbers.json`.
- Use public, clearly labeled government or official sources first.
- Keep `source`, `sourceUrl`, and `confidence` for every seeded record.

## Phase 2: user reports go to Firebase
- Keep user-submitted reports in Firebase (`phone_numbers`).
- Treat Firebase reports as untrusted until reviewed.

## Phase 3: reviewed export for iOS caller ID
- Run `node scripts/merge_seed_database.js` to merge seed and local fallback records.
- Produce `data/ios_numbers.json` containing only reviewed `scam`/`suspicious` records in MX E.164 integer format.
- This file is designed for future iPhone Call Directory export workflows.

## Phase 4: trust scoring before caller-ID visibility
- Add review/admin trust scores before records become caller-ID-visible.
- Keep a human review step to prevent poisoned or low-quality data from becoming visible.

## Guardrails
- Do **not** blindly auto-import community websites.
- Community sources (for example Tellows) require manual review before merge.
- Preserve source metadata and confidence during all merges.
