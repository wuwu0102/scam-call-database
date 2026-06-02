# Phone Classification Compatibility Strategy

Production safety status: documentation-only proposal. This strategy does not modify production data, Firestore documents, public website files, export scripts, workflows, app code, or generated exports.

## 1. Repository audit

The audit searched tracked files for `tag`, `label`, `category`, `ios_numbers.json`, and `export_ios_numbers_from_firestore.js`.

### Production lookup and export paths

| Area | Files | Current usage |
| --- | --- | --- |
| Website lookup | `search.js`, `index.html` | Firestore collection `phone_numbers` is queried by `normalizedNumber`. Lookup returns `record.tag` as both `label` and `tag`, plus localized `record.label` as display text. |
| iOS Caller ID export | `scripts/export_ios_numbers_from_firestore.js`, `data/ios_numbers.json`, `.github/workflows/export-ios-caller-id-json.yml` | Export reads Firestore/fallback sources, filters by `tag` and `confidence`, and writes `number`, `label`, and `updatedAt` rows to `data/ios_numbers.json`. |
| iOS Caller ID extension | `side_projects/ios-phone-callerid/extension_source/PhoneNumberRecord.swift`, `PhoneNumberParser.swift`, `CallDirectoryHandler.swift` | Swift decoder currently requires `number` and `label`; extra JSON fields would be ignored by `Decodable` if added later. |
| Flutter / Android-capable lookup scaffold | `side_projects/flutter-phone-lookup-app/lib/main.dart`, `lib/screens/search_screen.dart`, `lib/services/firestore_service.dart` | Lookup and reporting use the existing `phone_numbers` collection and `tag` field. |
| Firestore schema docs | `admin/firestore_fields.md`, `data/schema.md` | Document `tag` as an existing required string and `label` as localized display copy. |
| Automation and validation | `scripts/validate_ios_export.js`, `scripts/validate_database.js`, `scripts/rebuild_searchable_database.js`, `scripts/check_database_safety.js`, `scripts/check_data_safety.js` | Existing validation protects 10-digit iOS export shape, public count, safe data changes, and database invariants. |
| Data and generated reports | `data/*.json`, `data/*.csv`, `reports/*.json`, `scam_numbers.json` | Existing records and generated artifacts contain historical uses of `tag`, `label`, and/or `category`. These files were audited but must not be migrated by this strategy. |

### Relevant tracked-file hit list

- Workflow references: `.github/workflows/collect-and-import-mexico-numbers.yml`, `.github/workflows/export-ios-caller-id-json.yml`.
- Documentation references: `README.md`, `admin/firestore_fields.md`, `admin/import_mexico_seed_to_firestore.md`, `data/schema.md`, `scripts/README_AUTOMATION.md`, iOS and Flutter README files.
- Website references: `index.html`, `search.js`.
- Export and validation references: `scripts/export_ios_numbers_from_firestore.js`, `scripts/validate_ios_export.js`, `scripts/validate_database.js`, `scripts/rebuild_searchable_database.js`.
- Firestore/import/reporting scripts: `scripts/import_mexico_seed_to_firestore.js`, `scripts/import_verified_seed_numbers.js`, `scripts/import_community_bulk_numbers.js`, `scripts/promote_pending_numbers.js`, `scripts/promote_safe_scraped_numbers.js`, `scripts/auto_review_user_reports.js`, `scripts/auto_promote_safe_numbers.js`, and related collection/audit scripts.
- Client references: `side_projects/ios-phone-callerid/**`, `side_projects/flutter-phone-lookup-app/**`.
- Data/report references: `data/*.json`, `data/*.csv`, `reports/*.json`, `scam_numbers.json`.

## 2. Current effective classification model

### Firestore fields

The production collection is `phone_numbers`. The effective classification contract is:

- `tag`: existing primary machine-readable status used by lookup, exports, import scripts, and clients. Current known values include `scam`, `suspicious`, `safe`, and `unknown` in client docs and script filters.
- `label`: existing localized display object, for example `label.es-MX`, `label.en`, and `label.zh-TW`.
- `confidence`: existing export gate, used with `tag` to decide iOS export eligibility.
- `normalizedNumber`: existing lookup key.
- Other metadata fields such as `number`, `country`, `sourceType`, `sourceName`, `sourceUrl`, `note`, and `createdAt` remain outside the classification change.

### Export fields

The current iOS export writes rows like:

```json
{
  "number": 5512345678,
  "label": "Número sospechoso",
  "updatedAt": ""
}
```

The export label is derived from `tag`:

- `tag == "scam"` becomes `"Posible fraude"`.
- eligible non-scam suspicious records become `"Número sospechoso"`.

### Website fields

The website lookup contract remains:

- Query `phone_numbers` by `normalizedNumber`.
- Return `record.tag` as the existing status.
- Return `record.label` as localized display copy.
- Do not read any future category field unless a separate production change explicitly adds support later.

### iOS fields

The iOS Call Directory extension currently consumes only:

- `number`: integer phone number.
- `label`: caller ID string.

The current Swift decoder ignores unknown JSON keys, so adding an optional `category` key to future JSON rows is backward-compatible for this extension as long as `number` and `label` remain unchanged.

## 3. Backward-compatible compatibility layer

### Additive Firestore field proposal

Add this optional nested field only for new or explicitly updated records in the future:

```json
{
  "classificationCompat": {
    "category": "telemarketing"
  }
}
```

Allowed future values:

- `scam`
- `telemarketing`
- `debt_collection`
- `harassment`
- `safe`
- `unknown`

### Compatibility rules

1. Do not rename, remove, or reinterpret `tag`.
2. Do not rename, remove, or reinterpret `label`.
3. Do not migrate existing production records as part of this strategy.
4. Do not run Firestore writes as part of this strategy.
5. Do not change collection names, document IDs, lookup paths, public URLs, or workflow schedules.
6. Treat `classificationCompat.category` as optional metadata. Missing category means `unknown` to future consumers only.
7. Existing consumers must continue reading `tag` and `label` until each client has an explicit compatibility release.

### Suggested read behavior for future clients only

Future clients can resolve a category with this order:

1. If `classificationCompat.category` is present and is one of the allowed values, use it.
2. Otherwise map legacy `tag` defensively:
   - `scam` -> `scam`
   - `suspicious` -> `unknown` or a UI-specific generic warning bucket
   - `safe` -> `safe`
   - any other/missing value -> `unknown`
3. Continue displaying existing localized `label` text for user-facing copy.

This keeps current production clients unchanged while allowing new clients to opt in.

## 4. Future `ios_numbers.json` export design proposal

Current backward-compatible row shape must remain valid:

```json
{
  "number": 5512345678,
  "label": "Número sospechoso"
}
```

Future additive row shape:

```json
{
  "number": 5512345678,
  "label": "Número sospechoso",
  "category": "telemarketing"
}
```

Export compatibility requirements:

- Keep `number` unchanged in type and meaning.
- Keep `label` unchanged in type and meaning.
- Add `category` only as an optional extra key.
- Keep current filtering and counts unchanged unless a later task explicitly changes eligibility rules.
- Derive `category` from `classificationCompat.category` when present and valid.
- Use `unknown` or omit `category` when the source lacks `classificationCompat.category`; omitting is the lowest-risk first export rollout.
- Do not remove existing `updatedAt` from the current export without a separate compatibility review, because existing consumers may already tolerate or inspect it.

Because Swift `Decodable` ignores unknown keys by default, adding `category` later should not break the existing iOS extension. Older JSON readers that only access `number` and `label` should also continue to work.

## 5. Compatibility report

### Current state

- Firestore and website lookup use `tag` as the effective machine-readable status.
- Localized `label` is display copy, not a stable category taxonomy.
- Existing export logic uses `tag` plus `confidence` to decide whether a record enters `ios_numbers.json`.
- iOS Caller ID consumes only `number` and `label`.
- Flutter/Android-capable lookup scaffolds read and write `tag`.

### Proposed state

- Preserve all current fields and behavior.
- Add optional `classificationCompat.category` only for future records or explicit future updates.
- Add optional `category` only to future export rows after export/client compatibility testing.
- Keep existing `tag` and `label` as the stable compatibility contract.

### Risks

| Risk | Mitigation |
| --- | --- |
| Existing data contains historical `category` values with inconsistent meanings. | Use a new nested `classificationCompat.category` field instead of reusing top-level `category`. |
| A client depends on exact export keys. | Add `category` only after testing older clients; preserve `number` and `label`; avoid changing counts or filters. |
| Future category values are treated as user-facing labels. | Keep category machine-readable and continue using `label` for display text. |
| Bulk migration changes production behavior. | No migration and no Firestore writes in this strategy. |
| Export count changes accidentally. | Export phase must run current and proposed exporters side by side and compare row counts and sorted numbers before rollout. |

### Compatibility impact

| Consumer | Impact of this documentation-only strategy | Impact of future additive field |
| --- | --- | --- |
| Website lookup | None. | None if website keeps reading `tag` and `label`. |
| GitHub Pages | None. | None if public files and URLs are unchanged. |
| Firestore schema | None now. | Additive optional nested field only; no collection or existing field changes. |
| Existing iOS Caller ID extension | None. | Should remain compatible if export keeps `number` and `label`; unknown `category` key is ignored by current decoder. |
| Android / Flutter lookup clients | None. | None if clients keep reading `tag`; future clients may optionally read `classificationCompat.category`. |
| Existing exports | None. | Valid if `number` and `label` stay present and eligibility/counts stay unchanged. |
| Workflows | None. | None if schedules, file paths, and generated file names remain unchanged. |

## 6. Verification plan for a future code rollout

Before changing export code or clients, verify safely:

1. Run current validation: `npm run validate`.
2. Produce the existing export in a throwaway workspace or temporary file; do not commit generated data unless explicitly requested.
3. Produce the proposed export to a different temporary file.
4. Compare row count, sorted `number` list, and labels between current and proposed exports.
5. Confirm only optional `category` differs.
6. Decode the proposed JSON with the current iOS `PhoneNumberRecord` model.
7. Run website lookup tests or a static smoke test confirming `search.js` still queries `tag`/`label` only.
8. Confirm no Firestore writes were executed.

## 7. Final recommendation

Recommended option: **A. Change export only**, and only in a later, explicitly approved rollout.

Why this is safest:

- It preserves production Firestore records and all current lookup logic.
- It lets future clients start seeing categories from an additive JSON key without forcing an iOS or Android release first.
- Current iOS decoding should ignore unknown export keys while still requiring `number` and `label`.
- The export can be tested side by side with exact count and sorted-number comparisons before any generated file is published.

Do not choose **B. Change iOS only** first because there is no category field for iOS to consume yet, and an app-only change adds release risk without improving production data.

Do not choose **C. Change both** as the first production step because simultaneous export and client changes increase rollout complexity. Change both only after the additive export has proven stable and a client UI/UX for categories is explicitly requested.
