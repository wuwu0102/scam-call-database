const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { BLOCKED_LOCAL_SOURCES, normalizeMXNumber, isInvalidNumber } = require('./data_rules');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'ios_numbers.json');
const COLLECTION = 'phone_numbers';

function resolveUpdatedAt(record) { return typeof record.updatedAt === 'string' ? record.updatedAt : ''; }
function shouldExport(record) {
  const tag = String(record.tag || '').toLowerCase();
  const confidence = String(record.confidence || '').toLowerCase();
  const type = String(record.type || '').toLowerCase();
  const sourceUrl = String(record.sourceUrl || '');
  if (BLOCKED_LOCAL_SOURCES.has(sourceUrl) || ['safe','unknown'].includes(tag)) return false;
  if (type === 'community' && confidence === 'low') return false;
  if (tag === 'scam' && ['high','medium'].includes(confidence)) return true;
  if (tag === 'suspicious' && confidence === 'medium') return true;
  if (type === 'user_signal' && Number(record.reportCount || 0) >= 3 && Number(record.safeReports || 0) === 0) return true;
  return false;
}

async function main() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  const snapshot = await admin.firestore().collection(COLLECTION).get();
  const deduped = new Map();
  snapshot.forEach((doc) => {
    const record = doc.data() || {};
    const normalized = normalizeMXNumber(record.normalizedNumber || record.number || '');
    if (isInvalidNumber(normalized) || !shouldExport(record)) return;
    const number = Number(normalized);
    const next = { number, label: tagLabel(record.tag), updatedAt: resolveUpdatedAt(record) };
    const existing = deduped.get(number); if (!existing || (!existing.updatedAt && next.updatedAt)) deduped.set(number, next);
  });
  const output = Array.from(deduped.values()).sort((a, b) => a.number - b.number);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Exported ${output.length} records to ${OUTPUT_PATH}`);
}
function tagLabel(tag){const t=String(tag||'').toLowerCase(); return t==='scam'?'Posible fraude':'Número sospechoso';}
main().catch((e)=>{console.error(e);process.exit(1);});
