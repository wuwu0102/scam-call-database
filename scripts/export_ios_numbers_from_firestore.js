const fs = require('fs');
const path = require('path');
const { BLOCKED_LOCAL_SOURCES, normalizeMXNumber, isInvalidNumber } = require('./data_rules');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'ios_numbers.json');
const COLLECTED_PATH = path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json');
const SEED_PATH = path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json');
const COLLECTION = 'phone_numbers';

function resolveUpdatedAt(record) {
  return typeof record.updatedAt === 'string' ? record.updatedAt : '';
}

function safeParseJson(jsonText) {
  if (!jsonText) {
    console.warn('No data from Firestore, using empty array');
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Invalid JSON, fallback to empty array');
    return [];
  }
}

function readJsonArrayFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return safeParseJson(content);
}

function shouldExport(record) {
  if (!record || typeof record !== 'object') return false;

  const tag = String(record.tag || '').toLowerCase();
  const confidence = String(record.confidence || '').toLowerCase();
  const type = String(record.type || '').toLowerCase();
  const sourceUrl = String(record.sourceUrl || '');

  if (!record.normalizedNumber) return false;
  if (!['scam', 'suspicious'].includes(tag)) return false;
  if (!['high', 'medium'].includes(confidence)) return false;
  if (BLOCKED_LOCAL_SOURCES.has(sourceUrl) || ['safe', 'unknown'].includes(tag)) return false;
  if (type === 'community' && confidence === 'low') return false;
  if (tag === 'scam' && ['high', 'medium'].includes(confidence)) return true;
  if (tag === 'suspicious' && confidence === 'medium') return true;
  if (type === 'user_signal' && Number(record.reportCount || 0) >= 3 && Number(record.safeReports || 0) === 0) return true;

  return false;
}

function isValidNormalizedNumber(normalized) {
  return typeof normalized === 'string' && /^\d{10}$/.test(normalized);
}

function tagLabel(tag) {
  const t = String(tag || '').toLowerCase();
  return t === 'scam' ? 'Posible fraude' : 'Número sospechoso';
}

async function getFirestoreRecords() {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is missing. Firestore export will fallback to local files.');
      return [];
    }

    let admin;
    try {
      admin = require('firebase-admin');
    } catch (error) {
      console.warn('firebase-admin is unavailable. Firestore export will fallback to local files.');
      return [];
    }

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
    }

    const snapshot = await admin.firestore().collection(COLLECTION).get();
    const records = [];
    snapshot.forEach((doc) => {
      records.push(doc.data() || {});
    });

    return records;
  } catch (error) {
    console.warn('Failed to fetch Firestore records, fallback to local files:', error.message);
    return [];
  }
}

async function main() {
  const firestoreRecords = await getFirestoreRecords();

  let records = firestoreRecords;
  if (!Array.isArray(records) || records.length === 0) {
    records = readJsonArrayFromFile(COLLECTED_PATH);
  }
  if (!Array.isArray(records) || records.length === 0) {
    records = readJsonArrayFromFile(SEED_PATH);
  }
  if (!Array.isArray(records)) {
    records = [];
  }

  const deduped = new Map();
  for (const record of records) {
    const normalized = normalizeMXNumber(record?.normalizedNumber || record?.number || '');
    if (!isValidNormalizedNumber(normalized)) continue;
    if (isInvalidNumber(normalized) || !shouldExport({ ...record, normalizedNumber: normalized })) continue;

    const number = Number(normalized);
    const next = { number, label: tagLabel(record.tag), updatedAt: resolveUpdatedAt(record) };
    const existing = deduped.get(number);
    if (!existing || (!existing.updatedAt && next.updatedAt)) {
      deduped.set(number, next);
    }
  }

  const output = Array.from(deduped.values()).sort((a, b) => a.number - b.number);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  const scamCount = output.filter((item) => item.label === 'Posible fraude').length;
  const suspiciousCount = output.filter((item) => item.label === 'Número sospechoso').length;

  console.log(`Exported ${output.length} records to ${OUTPUT_PATH}`);
  console.log('Export summary:');
  console.log('Total records:', records.length);
  console.log('Scam:', scamCount);
  console.log('Suspicious:', suspiciousCount);
}

main().catch((e) => {
  console.warn('Unexpected export error, writing empty output:', e.message);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, '[]\n');
});
