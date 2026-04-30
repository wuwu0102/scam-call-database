const fs = require('fs');
const path = require('path');
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const INPUTS = [
  path.join(__dirname, '..', 'data', 'collected_mexico_numbers.json'),
  path.join(__dirname, '..', 'data', 'mexico_seed_phone_numbers.json')
];
const TEST_NUMBERS = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);

const dryRun = process.argv.includes('--dry-run');
const ALLOWED_TAG = new Set(['scam','suspicious']);
const ALLOWED_CONF = new Set(['high','medium']);
const ALLOWED_TYPE = new Set(['official','government','police','fiscalia','media','crowd_multi_source']);

const read = (p)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];
const isDateLike = (n)=>/^20\d{8}$/.test(n);
function ok(r){
  if (typeof r?.tag === 'object') return false;
  const n = normalizeMXNumber(r.normalizedNumber || r.number || '');
  const tag = String(r.tag || '').toLowerCase();
  const conf = String(r.confidence || '').toLowerCase();
  const type = String(r.type || '').toLowerCase();
  const url = String(r.sourceUrl || '');
  if (!/^\d{10}$/.test(n) || isInvalidNumber(n) || TEST_NUMBERS.has(n) || isDateLike(n)) return false;
  if (!ALLOWED_TAG.has(tag) || !ALLOWED_CONF.has(conf) || !ALLOWED_TYPE.has(type)) return false;
  if (!isHttpUrl(url) || url.startsWith('local://')) return false;
  return true;
}

function build(records){
  const m = new Map();
  for (const r of records){
    if (!ok(r)) continue;
    const n = normalizeMXNumber(r.normalizedNumber || r.number || '');
    if (!m.has(n)) m.set(n, { ...r, normalizedNumber:n, number:n });
  }
  return Array.from(m.values());
}

(async()=>{
  const records = build(INPUTS.flatMap(read));
  if (dryRun) { console.log(`Dry run: ${records.length} records to import`); return; }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  const db = admin.firestore();
  let count = 0;
  for (const r of records){
    await db.collection('phone_numbers').doc(r.normalizedNumber).set({ ...r, importedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    count++;
  }
  console.log(`Import complete ${count}`);
})();
