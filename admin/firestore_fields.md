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
