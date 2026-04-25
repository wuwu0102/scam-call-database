const fs = require('fs');
const path = require('path');

const COLLECTION = 'phone_numbers';
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
  'collectedAt',
  'updatedAt',
  'importedAt',
];

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function readServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw || !raw.trim()) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
    process.exit(1);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON: must be valid JSON');
    process.exit(1);
  }
}

function readRecordsFromPath(inputPath) {
  if (!fs.existsSync(inputPath)) {
    return [];
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${path.basename(inputPath)} to contain an array`);
  }

  return parsed;
}

function isImportableRecord(record) {
  const tag = String(record.tag || '').toLowerCase();
  const type = String(record.type || record.sourceType || '').toLowerCase();
  const reviewStatus = String(record.reviewStatus || '').toLowerCase();
  const importableTag = tag === 'scam' || tag === 'suspicious';
  const importableTrust = reviewStatus === 'auto_approved' || type === 'official';

  return importableTag && importableTrust;
}

function mergeByNormalizedNumber(records) {
  const merged = new Map();

  for (const record of records) {
    const normalized = String(record.normalizedNumber || '').trim();
    const key = normalized || `generated:${JSON.stringify(record)}`;

    if (!merged.has(key)) {
      merged.set(key, record);
      continue;
    }

    const existing = merged.get(key);
    merged.set(key, {
      ...existing,
      ...record,
      sources: [...(existing.sources || []), ...(record.sources || [])],
    });
  }

  return Array.from(merged.values());
}

function readSeedRecords() {
  const allRecords = INPUT_PATHS.flatMap(readRecordsFromPath);
  return mergeByNormalizedNumber(allRecords).filter(isImportableRecord);
}

function buildPayload(record, importedAt) {
  const payload = {
    number: record.number,
    normalizedNumber: record.normalizedNumber,
    country: record.country,
    tag: record.tag,
    label: record.label,
    type: record.type || record.sourceType,
    confidence: record.confidence,
    source: record.source || record.sourceName,
    sourceUrl: record.sourceUrl,
    sources: record.sources,
    note: record.note,
    reviewStatus: record.reviewStatus,
    collectedAt: record.collectedAt,
    updatedAt: record.updatedAt || new Date().toISOString().slice(0, 10),
    importedAt,
  };

  const cleaned = {};

  for (const field of ALLOWED_FIELDS) {
    if (payload[field] !== undefined) {
      cleaned[field] = payload[field];
    }
  }

  return cleaned;
}

function resolveDocRef(collectionRef, record) {
  const normalized = String(record.normalizedNumber || '').trim();

  if (normalized) {
    return {
      docRef: collectionRef.doc(normalized),
      docId: normalized,
      usedNormalizedId: true,
    };
  }

  const generated = collectionRef.doc();
  return {
    docRef: generated,
    docId: generated.id,
    usedNormalizedId: false,
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const records = readSeedRecords();

  if (dryRun) {
    const importedAt = new Date().toISOString();
    console.log(`Dry run enabled. Found ${records.length} importable records in configured inputs.`);

    records.forEach((record, index) => {
      const normalized = String(record.normalizedNumber || '').trim();
      const docId = normalized || '[auto-generated-id]';
      const payload = buildPayload(record, importedAt);
      console.log(`[#${index + 1}] docId=${docId} merge=true payload=${JSON.stringify(payload)}`);
    });

    console.log('Dry run complete. No changes were written to Firestore.');
    return;
  }

  const serviceAccount = readServiceAccountFromEnv();

  let admin;
  try {
    // firebase-admin is only required for actual writes.
    admin = require('firebase-admin');
  } catch (error) {
    console.error('Missing dependency: firebase-admin. Install with: npm install firebase-admin');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();
  const collectionRef = db.collection(COLLECTION);
  const importedAt = admin.firestore.FieldValue.serverTimestamp();

  let importedCount = 0;
  let usedNormalizedIdCount = 0;
  let generatedIdCount = 0;

  for (const record of records) {
    const { docRef, usedNormalizedId, docId } = resolveDocRef(collectionRef, record);
    const payload = buildPayload(record, importedAt);

    await docRef.set(payload, { merge: true });

    importedCount += 1;
    if (usedNormalizedId) {
      usedNormalizedIdCount += 1;
    } else {
      generatedIdCount += 1;
    }

    console.log(`Imported record ${importedCount}/${records.length} -> ${docId} (merge=true)`);
  }

  console.log(
    `Import complete. Imported ${importedCount} records into ${COLLECTION}. ` +
      `normalizedNumber IDs: ${usedNormalizedIdCount}, generated IDs: ${generatedIdCount}`,
  );
}

main().catch((error) => {
  console.error('Failed to import Mexico seed phone numbers to Firestore.');
  console.error(error);
  process.exit(1);
});
