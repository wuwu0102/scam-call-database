# Required Firestore Fields (`phone_numbers`)

Required fields per document:

- `number` (string)
- `normalizedNumber` (string)
- `country` (string)
- `tag` (string)
- `label.zh-TW` (string)
- `label.en` (string)
- `label.es-MX` (string)
- `sourceType` (string)
- `sourceName` (string)
- `sourceUrl` (string)
- `note.zh-TW` (string)
- `note.en` (string)
- `note.es-MX` (string)
- `confidence` (string)
- `createdAt` (string date, example `2026-04-25`)

## Example document

```json
{
  "number": "5632910475",
  "normalizedNumber": "525632910475",
  "country": "MX",
  "tag": "scam",
  "label": {
    "zh-TW": "可疑／疑似詐騙",
    "en": "Suspicious / possible scam",
    "es-MX": "Sospechoso / posible estafa"
  },
  "sourceType": "official",
  "sourceName": "SAT México",
  "sourceUrl": "https://www.gob.mx/sat/acciones-y-programas/numeros-telefonicos-falsos",
  "note": {
    "zh-TW": "SAT 公布的假冒電話／簡訊號碼。",
    "en": "Phone/SMS number published by SAT as fake or suspicious.",
    "es-MX": "Número publicado por el SAT como falso o sospechoso."
  },
  "confidence": "high",
  "createdAt": "2026-04-25"
}
```

## Phase 1 classification compatibility fields

Phase 1 may add a `classification` object to `phone_numbers` documents, but it must not replace the legacy fields used by the website and released apps.

Required compatibility rules:

- Keep Firestore collection names unchanged: `phone_numbers` and `phone_number_reports`.
- Keep existing `number`, `normalizedNumber`, `tag`, and `label` fields available.
- Treat `classification.primaryTag` as an additive normalized view of the existing `tag` / `category` / `label` values.
- Treat `classification.riskTags` as additive tags for future filtering and auditing.
- Do not require the public website, iOS app, or CallKit export to read `classification` before they can continue working.

Rollback rule:

- Before applying Phase 1 to Firestore, run the migration with `--apply`; it creates `migration_backup.json` with original `phone_numbers` and `phone_number_reports` documents before writing additive fields.
- To roll back, run the same script with `--rollback`; it restores `phone_numbers` documents from `migration_backup.json`.
