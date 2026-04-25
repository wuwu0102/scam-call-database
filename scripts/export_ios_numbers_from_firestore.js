const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'ios_numbers.json');
const COLLECTION = 'phone_numbers';

function normalizeToE164Digits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;

  const number = Number(digits);
  if (!Number.isSafeInteger(number)) {
    return null;
  }

  return number;
}

function extractLabel(record) {
  const note = record.note;

  if (typeof note === 'string' && note.trim()) {
    return note.trim();
  }

  if (note && typeof note === 'object' && !Array.isArray(note)) {
    const preferredKeys = ['en', 'es-MX', 'zh-TW'];

    for (const key of preferredKeys) {
      const value = note[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    for (const value of Object.values(note)) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return 'Scam';
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION).get();

  const deduped = new Map();

  snapshot.forEach((doc) => {
    const record = doc.data() || {};
    if (String(record.tag || '').toLowerCase() !== 'scam') {
      return;
    }

    const number = normalizeToE164Digits(record.normalizedNumber);
    if (number === null) {
      return;
    }

    const label = extractLabel(record);
    const existing = deduped.get(number);

    if (!existing || (existing.label === 'Scam' && label !== 'Scam')) {
      deduped.set(number, { number, label });
    }
  });

  const output = Array.from(deduped.values()).sort((a, b) => a.number - b.number);

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Exported ${output.length} records to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('Failed to export iOS numbers from Firestore.');
  console.error(error);
  process.exit(1);
});
