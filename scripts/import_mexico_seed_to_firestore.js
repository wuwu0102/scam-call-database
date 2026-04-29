const fs = require('fs');
const path = require('path');

const COLLECTION = 'phone_numbers';
const { BLOCKED_LOCAL_SOURCES, TRUSTED_TYPES, TRUSTED_CONFIDENCE, normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');
const INPUT_PATHS = [
  path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json'),
  path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json'),
];
const ALLOWED_FIELDS = [
  'number',
  'normalizedNumber',
  'country',
  'tag',
  'label',
  'type',
  'confidence',
  'source',
  'sourceUrl',
  'sources',
  'note',
  'reviewStatus',
  'updatedAt',
  'importedAt',
];

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run') };
}

function readServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw || !raw.trim()) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
    process.exit(1);
  }

  try {
    return JSON.parse(raw);
  } catch {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON: must be valid JSON');
    process.exit(1);
  }
}

function readRecordsFromPath(inputPath) {
  if (!fs.existsSync(inputPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${path.basename(inputPath)} to contain an array`);
  }
  return parsed;
}

function priority(record) {
  const type = String(record.type || '').toLowerCase();
  const confidence = String(record.confidence || '').toLowerCase();

  if (type === 'official' && confidence === 'high') return 5;
  if (type === 'official' && confidence === 'medium') return 4;
  if (type === 'media' && confidence === 'medium') return 3;
  if (type === 'web' && confidence === 'low') return 2;
  if (type === 'user_report') return 1;
  return 0;
}

function sanitizeImportRecord(record) {
  const normalized = normalizeMXNumber(record.normalizedNumber || record.number || '');
  if (isInvalidNumber(normalized)) return null;

  const type = String(record.type || record.sourceType || '').toLowerCase();
  const reviewStatus = String(record.reviewStatus || '').toLowerCase();
  const confidence = String(record.confidence || '').toLowerCase();
  let tag = String(record.tag || '').toLowerCase();

  const sourceUrl = String(record.sourceUrl || '').trim();
  if (!isHttpUrl(sourceUrl) || BLOCKED_LOCAL_SOURCES.has(sourceUrl)) return null;
  if (typeof record.tag === 'object') return null;
  if (!TRUSTED_TYPES.has(type) || !TRUSTED_CONFIDENCE.has(confidence)) return null;
  if (!['scam','suspicious'].includes(tag)) return null;
  if (['safe','unknown'].includes(tag) || ['user_report','crowd_signal','community'].includes(type)) return null;


  const source = record.source || record.sourceName || 'Fuente pública';

  return {
    number: normalized,
    normalizedNumber: normalized,
    country: record.country || 'MX',
    tag,
    label: record.label || (tag === 'scam' ? 'Posible fraude' : 'Número sospechoso'),
    type: type || 'official',
    confidence: confidence || (type === 'official' ? 'medium' : 'low'),
    source,
    sourceUrl,
    sources: Array.isArray(record.sources)
      ? record.sources
      : [{ source, sourceUrl, type: type || 'official', confidence: record.confidence || 'medium' }],
    note: record.note || 'Número detectado en fuente pública.',
    reviewStatus,
    updatedAt: record.updatedAt || new Date().toISOString().slice(0, 10),
  };
}

function mergeByNormalizedNumber(records) {
  const merged = new Map();

  for (const record of records) {
    const sanitized = sanitizeImportRecord(record);
    if (!sanitized) continue;

    const existing = merged.get(sanitized.normalizedNumber);
    if (!existing) {
      merged.set(sanitized.normalizedNumber, sanitized);
      continue;
    }

    const sourceMap = new Map();
    [...(existing.sources || []), ...(sanitized.sources || [])].forEach((sourceRef) => {
      const key = `${sourceRef.sourceUrl || ''}::${sourceRef.source || ''}`;
      sourceMap.set(key, sourceRef);
    });

    const keep = priority(existing) >= priority(sanitized) ? existing : sanitized;
    merged.set(sanitized.normalizedNumber, {
      ...keep,
      sources: Array.from(sourceMap.values()),
    });
  }

  return Array.from(merged.values());
}

function readSeedRecords() {
  const seedRecords = readRecordsFromPath(INPUT_PATHS[0]);
  const collectedRecords = readRecordsFromPath(INPUT_PATHS[1]);

  if (collectedRecords.length === 0) {
    console.warn('collected_mexico_numbers.json is empty. Preserving Firestore data by importing seed records only.');
  }

  const allRecords = collectedRecords.length > 0
    ? [...seedRecords, ...collectedRecords]
    : [...seedRecords];

  return mergeByNormalizedNumber(allRecords);
}

function buildPayload(record, importedAt) {
  const payload = {
    ...record,
    importedAt,
  };

  const cleaned = {};
  for (const field of ALLOWED_FIELDS) {
    if (payload[field] !== undefined) cleaned[field] = payload[field];
  }
  return cleaned;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const records = readSeedRecords();

  if (dryRun) {
    const importedAt = new Date().toISOString();
    console.log(`Dry run enabled. Found ${records.length} importable records.`);
    records.forEach((record, index) => {
      const payload = buildPayload(record, importedAt);
      console.log(`[#${index + 1}] docId=${record.normalizedNumber} merge=true payload=${JSON.stringify(payload)}`);
    });
    return;
  }

  const serviceAccount = readServiceAccountFromEnv();

  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    console.error('Missing dependency: firebase-admin. Install with: npm install firebase-admin');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  const collectionRef = db.collection(COLLECTION);
  const importedAt = admin.firestore.FieldValue.serverTimestamp();

  let importedCount = 0;
  for (const record of records) {
    const payload = buildPayload(record, importedAt);
    await collectionRef.doc(record.normalizedNumber).set(payload, { merge: true });
    importedCount += 1;
    console.log(`Imported record ${importedCount}/${records.length} -> ${record.normalizedNumber}`);
  }

  console.log(`Import complete. Imported ${importedCount} records into ${COLLECTION}.`);
}

main().catch((error) => {
  console.error('Failed to import Mexico seed phone numbers to Firestore.');
  console.error(error);
  process.exit(1);
});
