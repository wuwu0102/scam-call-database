# Shared Phone Record Schema

`data/mexico_seed_phone_numbers.json` uses an array of records:

```json
[
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
]
```

## Rules

- `normalizedNumber` must be digits only.
- Mexico numbers should be normalized as:
  - 10-digit national number → `52` + number.
- Deduplicate by `normalizedNumber`.
- Sort records ascending by `normalizedNumber`.
- Confidence guidance:
  - `official` source => `high`
  - `crowd_report` source => `medium`
  - unknown/forum source => `low`
