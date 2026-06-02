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


## Phase 1 category compatibility layer

Phase 1 keeps the existing Firestore schema backward compatible. The required fields above remain required, and existing records do not need to change. In particular, `tag` remains the legacy field consumed by current lookup and export paths.

The optional compatibility structure is reserved for future records or an explicitly executed maintenance migration:

```json
{
  "classificationCompat": {
    "version": 1,
    "category": "scam",
    "legacyTag": "scam",
    "sourceField": "tag",
    "allowedCategories": [
      "scam",
      "suspicious",
      "telemarketing",
      "cobranza",
      "bank",
      "government",
      "delivery",
      "safe"
    ]
  }
}
```

Compatibility rules:

- `classificationCompat` is optional in Phase 1.
- `classificationCompat.category` must be one of `scam`, `suspicious`, `telemarketing`, `cobranza`, `bank`, `government`, `delivery`, or `safe`.
- `tag` must not be removed or renamed.
- Existing website lookup, app-facing files, and export scripts must continue to use their current fields until a later phase explicitly changes them.
- Adding the optional structure must be merge-only and must not overwrite phone numbers, labels, notes, sources, confidence, timestamps, or existing category/tag fields.
- Phase 1 does not execute a data migration and does not regenerate exports.

Read-only audit command:

```bash
node scripts/audit_classification_compatibility.js --input=data/mexico_seed_phone_numbers.json
```

Dry-run migration preview command:

```bash
node scripts/migrate_classification_phase1.js --dry-run --input=data/mexico_seed_phone_numbers.json
```
