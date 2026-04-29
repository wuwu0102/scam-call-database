const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'ios_numbers.json');
const COLLECTION = 'phone_numbers';

function normalizeToNumeric(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(digits)) return null;

  const number = Number(digits);
  if (!Number.isSafeInteger(number)) return null;
  return number;
}

function resolveLabel(record) {
  if (typeof record.label === 'string' && record.label.trim()) {
    return record.label.trim();
  }

  const tag = String(record.tag || '').toLowerCase();
  if (tag === 'scam') return 'Posible fraude';
  if (tag === 'suspicious') return 'Número sospechoso';
  if (tag === 'safe') return 'Seguro';
  return 'Desconocido';
}

function resolveUpdatedAt(record) {
  if (typeof record.updatedAt === 'string' && record.updatedAt.trim()) {
    return record.updatedAt.trim();
  }

  if (record.updatedAt && typeof record.updatedAt.toDate === 'function') {
    return record.updatedAt.toDate().toISOString().slice(0, 10);
  }

  return '';
}

function shouldExport(record) {
  const tag = String(record.tag || '').toLowerCase();
  const confidence = String(record.confidence || '').toLowerCase();
  const type = String(record.type || '').toLowerCase();
  const reportCount = Number(record.reportCount || 0);
  const safeReports = Number(record.safeReports || 0);

  if (tag === 'scam' && ['high', 'medium'].includes(confidence)) return true;
  if (tag === 'suspicious' && confidence === 'medium') return true;
  if (type === 'user_signal' && reportCount >= 3 && safeReports === 0) return true;
  return false;
}

async function main() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (raw && raw.trim()) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw)),
      });
    } else {
      admin.initializeApp();
    }
  }

  const db = admin.firestore();
  const snapshot = await db.collection(COLLECTION).get();
  const deduped = new Map();

  snapshot.forEach((doc) => {
    const record = doc.data() || {};
    const number = normalizeToNumeric(record.normalizedNumber || record.number);
    if (number === null || !shouldExport(record)) return;

    const next = {
      number,
      label: resolveLabel(record),
      updatedAt: resolveUpdatedAt(record),
    };

    const existing = deduped.get(number);
    if (!existing || (!existing.updatedAt && next.updatedAt)) {
      deduped.set(number, next);
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
