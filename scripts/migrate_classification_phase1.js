const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const DEFAULT_COLLECTION = 'phone_numbers';
const COMPAT_FIELD = 'classificationCompat';

const ALLOWED_CATEGORIES = new Set([
  'scam',
  'suspicious',
  'telemarketing',
  'cobranza',
  'bank',
  'government',
  'delivery',
  'safe'
]);

const LEGACY_TAG_TO_CATEGORY = new Map([
  ['scam', 'scam'],
  ['fraud', 'scam'],
  ['extortion', 'scam'],
  ['phishing', 'scam'],
  ['suspicious', 'suspicious'],
  ['unknown_risk', 'suspicious'],
  ['crowd_signal', 'suspicious'],
  ['senal reportada por multiples fuentes', 'suspicious'],
  ['senal comunitaria reportada', 'suspicious'],
  ['spam', 'telemarketing'],
  ['telemarketing', 'telemarketing'],
  ['collection', 'cobranza'],
  ['debt_collection', 'cobranza'],
  ['cobranza', 'cobranza'],
  ['bank', 'bank'],
  ['government', 'government'],
  ['delivery', 'delivery'],
  ['safe', 'safe']
]);

function usage() {
  console.log(`Usage: node scripts/migrate_classification_phase1.js --dry-run [--input=<json-file>]\n       node scripts/migrate_classification_phase1.js --execute [--collection=phone_numbers]\n\nPhase 1 compatibility migration tool.\n\nDefault mode is read-only. The script only writes to Firestore when --execute is provided.\nIt preserves existing fields, including tag, and adds ${COMPAT_FIELD} as a merge-only compatibility layer.\nIt never exports data and never generates data/ios_numbers.json.`);
}

function getArg(name) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function normalizeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveCategory(record) {
  const explicitCategory = normalizeValue(record.category);
  if (ALLOWED_CATEGORIES.has(explicitCategory)) {
    return { category: explicitCategory, sourceField: 'category' };
  }

  const legacyTag = normalizeValue(record.tag);
  if (LEGACY_TAG_TO_CATEGORY.has(legacyTag)) {
    return { category: LEGACY_TAG_TO_CATEGORY.get(legacyTag), sourceField: 'tag' };
  }

  return null;
}

function buildCompat(record) {
  const resolved = resolveCategory(record);
  if (!resolved) return null;

  return {
    version: 1,
    category: resolved.category,
    legacyTag: normalizeValue(record.tag) || null,
    sourceField: resolved.sourceField,
    allowedCategories: Array.from(ALLOWED_CATEGORIES)
  };
}

function readJsonArray(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  throw new Error(`Expected an array or { records: [] } in ${filePath}`);
}

function documentIdFor(record, fallback) {
  return String(record.normalizedNumber || record.number || record.id || fallback).trim();
}

function summarize(records) {
  const summary = { total: records.length, compatible: 0, unmapped: 0, byCategory: {} };
  for (const category of ALLOWED_CATEGORIES) summary.byCategory[category] = 0;

  for (const record of records) {
    const compat = buildCompat(record);
    if (!compat) {
      summary.unmapped += 1;
      continue;
    }
    summary.compatible += 1;
    summary.byCategory[compat.category] += 1;
  }
  return summary;
}

async function readFirestoreRecords(collectionName) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');

  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }

  const snapshot = await admin.firestore().collection(collectionName).get();
  const records = [];
  snapshot.forEach((doc) => records.push({ id: doc.id, ...doc.data() }));
  return { admin, records };
}

async function executeFirestoreMigration(collectionName) {
  const { admin, records } = await readFirestoreRecords(collectionName);
  const db = admin.firestore();
  let updated = 0;
  let skipped = 0;

  for (const record of records) {
    const compat = buildCompat(record);
    if (!compat) {
      skipped += 1;
      continue;
    }

    const docId = documentIdFor(record, record.id);
    await db.collection(collectionName).doc(docId).set({ [COMPAT_FIELD]: compat }, { merge: true });
    updated += 1;
  }

  console.log(`Migration complete. Updated=${updated}; skipped=${skipped}; collection=${collectionName}`);
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    usage();
    return;
  }

  const execute = process.argv.includes('--execute');
  const dryRun = process.argv.includes('--dry-run') || !execute;
  const collectionName = getArg('--collection') || DEFAULT_COLLECTION;
  const input = getArg('--input');

  if (execute && input) {
    throw new Error('--execute writes Firestore only; remove --input or use --dry-run for local JSON previews');
  }

  if (!execute) {
    const inputPath = path.resolve(root, input || 'data/mexico_seed_phone_numbers.json');
    const records = readJsonArray(inputPath);
    const summary = summarize(records);
    console.log('Phase 1 classification migration dry run');
    console.log(`Input: ${path.relative(root, inputPath)}`);
    console.log(`Records checked: ${summary.total}`);
    console.log(`Records that would receive ${COMPAT_FIELD}: ${summary.compatible}`);
    console.log(`Records skipped as unmapped: ${summary.unmapped}`);
    for (const category of ALLOWED_CATEGORIES) {
      console.log(`- ${category}: ${summary.byCategory[category]}`);
    }
    console.log('No files were written. Firestore was not modified. Export behavior was not modified.');
    return;
  }

  if (dryRun) {
    throw new Error('Internal mode error: --execute and dry-run were both selected');
  }

  await executeFirestoreMigration(collectionName);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
