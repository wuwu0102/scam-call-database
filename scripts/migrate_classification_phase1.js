const fs = require('fs');
const path = require('path');
const { applyClassificationCompat } = require('./lib/classification_compat');

const ROOT = path.join(__dirname, '..');
const BACKUP_PATH = path.join(ROOT, 'migration_backup.json');
const COLLECTION_NAME = 'phone_numbers';
const REPORT_COLLECTION_NAME = 'phone_number_reports';

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialPath) return JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  return null;
}

async function getDb({ required = true } = {}) {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    if (required) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
    return null;
  }
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function readCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const rows = [];
  snapshot.forEach((doc) => rows.push({ id: doc.id, data: doc.data() || {} }));
  return rows;
}

async function writeBackup(phoneRows, reportRows) {
  if (fs.existsSync(BACKUP_PATH)) {
    throw new Error('migration_backup.json already exists; move it before creating a new migration backup');
  }
  const backup = {
    createdAt: new Date().toISOString(),
    collections: {
      [COLLECTION_NAME]: phoneRows,
      [REPORT_COLLECTION_NAME]: reportRows
    }
  };
  fs.writeFileSync(BACKUP_PATH, `${JSON.stringify(backup, null, 2)}\n`);
}

async function applyPhase1(db, phoneRows) {
  let updated = 0;
  for (const row of phoneRows) {
    const next = applyClassificationCompat(row.data);
    await db.collection(COLLECTION_NAME).doc(row.id).set({
      classification: next.classification,
      tag: row.data.tag || next.tag,
      label: row.data.label || next.label
    }, { merge: true });
    updated += 1;
  }
  return updated;
}

async function rollback(db) {
  if (!fs.existsSync(BACKUP_PATH)) throw new Error('migration_backup.json not found');
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const phoneRows = backup.collections?.[COLLECTION_NAME] || [];
  let restored = 0;
  for (const row of phoneRows) {
    await db.collection(COLLECTION_NAME).doc(row.id).set(row.data);
    restored += 1;
  }
  return restored;
}

function readLocalPreviewRows() {
  const files = ['data/collected_mexico_numbers.json', 'data/mexico_seed_phone_numbers.json'];
  const rows = [];
  for (const file of files) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!Array.isArray(parsed)) continue;
    parsed.slice(0, 25).forEach((data, index) => rows.push({ id: `${file}:${index}`, data }));
  }
  return rows;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || (!process.argv.includes('--apply') && !process.argv.includes('--rollback'));
  const shouldApply = process.argv.includes('--apply');
  const shouldRollback = process.argv.includes('--rollback');
  const db = await getDb({ required: !dryRun });

  if (shouldRollback) {
    const restored = await rollback(db);
    console.log(`Rollback restored ${restored} ${COLLECTION_NAME} documents from migration_backup.json`);
    return;
  }

  const phoneRows = db ? await readCollection(db, COLLECTION_NAME) : readLocalPreviewRows();
  const reportRows = db ? await readCollection(db, REPORT_COLLECTION_NAME) : [];
  const preview = phoneRows.slice(0, 5).map((row) => ({ id: row.id, classification: applyClassificationCompat(row.data).classification }));

  if (dryRun) {
    console.log(JSON.stringify({
      mode: db ? 'dry-run-firestore' : 'dry-run-local-preview-no-credentials',
      collectionsPreserved: [COLLECTION_NAME, REPORT_COLLECTION_NAME],
      backupPath: 'migration_backup.json',
      phoneNumberDocuments: phoneRows.length,
      reportDocumentsBackedUp: reportRows.length,
      preview
    }, null, 2));
    return;
  }

  if (!shouldApply) throw new Error('Use --apply to write Phase 1 classification fields or --dry-run to preview');
  await writeBackup(phoneRows, reportRows);
  const updated = await applyPhase1(db, phoneRows);
  console.log(`Phase 1 classification migration updated ${updated} ${COLLECTION_NAME} documents; backup saved to migration_backup.json`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
