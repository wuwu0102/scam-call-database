const fs = require('fs');
const path = require('path');
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'data', 'collected_mexico_numbers.json');

const args = process.argv.slice(2);
const min = Number((args.find(a => a.startsWith('--min=')) || '--min=300').split('=')[1]);
const target = Number((args.find(a => a.startsWith('--target=')) || '--target=1000').split('=')[1]);

const allowedTypes = new Set(['official','media','crowd','crowd_multi_source','government','police','fiscalia']);
const testNumbers = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);

function read(rel, fallback=[]) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return fallback;
  const v = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.records)) return v.records;
  return fallback;
}

function toRecord(raw) {
  const normalizedNumber = normalizeMXNumber(raw.normalizedNumber || raw.number || '');
  if (!/^\d{10}$/.test(normalizedNumber) || isInvalidNumber(normalizedNumber) || testNumbers.has(normalizedNumber)) return null;
  if (/^(19|20)\d{8}$/.test(normalizedNumber)) return null;

  const sourceUrl = String(raw.sourceUrl || '').trim();
  if (!isHttpUrl(sourceUrl) || sourceUrl.startsWith('local://')) return null;

  const typeRaw = String(raw.type || 'media').toLowerCase();
  const type = typeRaw === 'crowd_multi_source' ? 'crowd_multi_source' : typeRaw;
  if (!allowedTypes.has(type)) return null;

  const tagRaw = raw.tag;
  if (tagRaw && typeof tagRaw === 'object') return null;
  const loweredTag = String(tagRaw || '').toLowerCase();
  if (loweredTag === 'safe' || loweredTag === 'unknown') return null;

  const isCrowd = type === 'crowd' || type === 'crowd_multi_source';
  const confidence = isCrowd ? (type === 'crowd_multi_source' ? 'medium' : (String(raw.confidence || 'low').toLowerCase() === 'high' ? 'medium' : String(raw.confidence || 'low').toLowerCase())) : (String(raw.confidence || 'medium').toLowerCase());
  const tag = isCrowd ? 'suspicious' : (loweredTag === 'scam' ? 'scam' : 'suspicious');

  return {
    number: normalizedNumber,
    normalizedNumber,
    country: 'MX',
    tag,
    label: 'Número sospechoso',
    type: isCrowd ? type : (type === 'government' || type === 'police' || type === 'fiscalia' ? 'official' : type),
    confidence,
    source: String(raw.source || raw.name || 'unknown source'),
    sourceUrl,
    note: isCrowd ? 'Número reportado en fuente pública comunitaria. No confirmado oficialmente.' : (raw.note || ''),
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

const merged = [
  ...read('data/collected_mexico_numbers.json'),
  ...read('data/crowd_signal_mexico_numbers.json'),
  ...read('data/mexico_seed_phone_numbers.json'),
  ...read('data/firestore_phone_numbers_snapshot.json'),
  ...read('data/ios_numbers.json'),
  ...read('scam_numbers.json')
];

const byNumber = new Map();
for (const raw of merged) {
  const rec = toRecord(raw);
  if (!rec) continue;
  const prev = byNumber.get(rec.normalizedNumber);
  if (!prev) {
    byNumber.set(rec.normalizedNumber, rec);
    continue;
  }
  const score = (r) => (r.type === 'official' ? 3 : r.type === 'media' ? 2 : r.type === 'crowd_multi_source' ? 2 : 1);
  if (score(rec) > score(prev)) byNumber.set(rec.normalizedNumber, rec);
}

const result = Array.from(byNumber.values()).sort((a,b)=>a.normalizedNumber.localeCompare(b.normalizedNumber));
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`rebuild done count=${result.length} min=${min} target=${target}`);
if (result.length < min) process.exit(1);
