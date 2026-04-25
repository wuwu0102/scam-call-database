const fs = require('fs');
const path = require('path');

const COLLECTION = 'phone_numbers';
const INPUT_PATH = path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json');
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
  'note',
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

function readSeedRecords() {
  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Expected mexico_seed_phone_numbers.json to contain an array');
  }

  return parsed;
}

function buildPayload(record, importedAt) {
  const payload = {
    number: record.number,
    normalizedNumber: record.normalizedNumber,
    country: record.country,
    tag: record.tag,
    label: record.label,
    type: record.type,
    confidence: record.confidence,
    source: record.source,
    sourceUrl: record.sourceUrl,
    note: record.note,
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
    console.log(`Dry run enabled. Found ${records.length} records in ${INPUT_PATH}.`);

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
