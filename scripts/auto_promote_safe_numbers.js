const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PENDING = path.join(ROOT, 'data', 'pending_numbers.json');
const SCAM = path.join(ROOT, 'scam_numbers.json');
const IOS = path.join(ROOT, 'data', 'ios_numbers.json');
const BACKUP = path.join(ROOT, 'data', 'backups', 'scam_numbers.backup.json');
const TMP = path.join(ROOT, 'scam_numbers.tmp.json');
const REPORT = path.join(ROOT, 'data', 'collection_report.json');
const SEED_CSV = path.join(ROOT, 'data', 'seed_verified_public_numbers.csv');

const MAX_PROMOTE = 800;
const OFFICIAL_TYPES = new Set(['official_federal', 'official_state', 'official_state_announcement', 'official_state_lookup']);
const BLOCKED_TYPES = new Set(['manual_import', 'community', 'community_report', 'unknown']);
const SINGLE_SOURCE_BLOCKED_TYPES = new Set(['public_report', 'news_or_public_reference']);

function safeReadArray(file) { try { const p = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(p) ? p : []; } catch { return []; } }
function isValidMX(num) { return /^\+52\d{10}$/.test(num || ''); }
function bannedNumber(num) {
  if (!isValidMX(num)) return true;
  return /^\+52(911|089|088|070|072)/.test(num) || /^\+52800/.test(num) || /^\+5201800/.test(num);
}
function bannedText(v) { return /(hotline|contact|conmutador|客服|oficial hotline)/i.test(String(v || '')); }
function csvSplit(line){return line.split(',').map((x)=>x.trim());}

function parseSeedHighConfidenceNumbers() {
  if (!fs.existsSync(SEED_CSV)) return new Set();
  const lines = fs.readFileSync(SEED_CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return new Set();
  const header = csvSplit(lines[0]).map((h) => h.toLowerCase());
  const numberIdx = header.findIndex((h) => ['number', 'phone', 'phone_number', 'normalizednumber'].includes(h));
  const confidenceIdx = header.findIndex((h) => h === 'confidence');
  if (numberIdx < 0 || confidenceIdx < 0) return new Set();
  const out = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = csvSplit(lines[i]);
    const number = String(cols[numberIdx] || '').trim();
    const confidence = Number(cols[confidenceIdx] || 0);
    if (confidence >= 0.75 && isValidMX(number) && !bannedNumber(number)) out.add(number);
  }
  return out;
}

function normalizeForIos(number){ return String(number || '').replace(/^\+52/,''); }

function run() {
  const pending = safeReadArray(PENDING);
  const current = safeReadArray(SCAM);
  const ios = safeReadArray(IOS);
  const previousOfficialCount = current.length;
  const previousIosCount = ios.length;
  const by = new Map(current.map((i) => [i.number, i]));
  const seedHighConfidence = parseSeedHighConfidenceNumbers();

  const aggregate = new Map();
  for (const item of pending) {
    if (!item || !item.number) continue;
    if (!aggregate.has(item.number)) aggregate.set(item.number, { sourceUrls: new Set(), sourceTypes: new Set(), maxConfidence: 0 });
    const agg = aggregate.get(item.number);
    if (item.sourceUrl) agg.sourceUrls.add(String(item.sourceUrl).trim());
    if (item.sourceType) agg.sourceTypes.add(String(item.sourceType).trim());
    agg.maxConfidence = Math.max(agg.maxConfidence, Number(item.confidence || 0));
  }

  let promoted = 0;
  const promotedSourceTypes = {};
  const promotedSourceNames = {};
  const promotedNumbers = [];

  for (const item of pending) {
    if (promoted >= MAX_PROMOTE) break;
    if (!item || !item.number || by.has(item.number)) continue;
    const number = String(item.number);
    const sourceType = String(item.sourceType || '').trim();
    const sourceName = String(item.sourceName || '').trim();
    const sourceUrl = String(item.sourceUrl || '').trim();
    const confidence = Number(item.confidence || 0);
    const agg = aggregate.get(number) || { sourceUrls: new Set(), maxConfidence: 0 };

    if (bannedNumber(number) || bannedText(sourceName) || bannedText(sourceUrl)) continue;
    if (!sourceName || !sourceUrl) continue;
    if (BLOCKED_TYPES.has(sourceType)) continue;
    if (SINGLE_SOURCE_BLOCKED_TYPES.has(sourceType) && agg.sourceUrls.size < 2) continue;

    const ruleA = OFFICIAL_TYPES.has(sourceType) && confidence >= 0.7;
    const ruleB = sourceType === 'financial_fraud' && confidence >= 0.75;
    const ruleC = agg.sourceUrls.size >= 2 && agg.maxConfidence >= 0.65;
    const ruleD = seedHighConfidence.has(number) && confidence >= 0.75;

    if (!(ruleA || ruleB || ruleC || ruleD)) continue;

    by.set(number, {
      number,
      label: item.label || 'suspicious',
      country: item.country || 'MX',
      sourceName,
      sourceUrl,
      sourceType,
      confidence,
      note: item.note || '',
      updatedAt: item.updatedAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    });

    promotedNumbers.push(number);
    promotedSourceTypes[sourceType] = (promotedSourceTypes[sourceType] || 0) + 1;
    promotedSourceNames[sourceName] = (promotedSourceNames[sourceName] || 0) + 1;
    promoted++;
  }

  const next = Array.from(by.values()).sort((a, b) => a.number.localeCompare(b.number));
  fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
  fs.writeFileSync(BACKUP, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  fs.writeFileSync(TMP, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  fs.renameSync(TMP, SCAM);

  const iosMap = new Map(ios.map((r) => [String(r.number), r]));
  for (const n of promotedNumbers) {
    const n10 = normalizeForIos(n);
    if (!/^\d{10}$/.test(n10)) continue;
    if (!iosMap.has(n10)) {
      iosMap.set(n10, { number: n10, label: 'Número sospechoso', updatedAt: new Date().toISOString().slice(0, 10) });
    }
  }
  const iosNext = Array.from(iosMap.values()).sort((a, b) => String(a.number).localeCompare(String(b.number)));
  fs.writeFileSync(IOS, `${JSON.stringify(iosNext, null, 2)}\n`, 'utf8');

  try {
    const obj = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
    obj.previousOfficialCount = previousOfficialCount;
    obj.newOfficialCount = next.length;
    obj.promotedThisRun = promoted;
    obj.maxPromoteLimit = MAX_PROMOTE;
    obj.previousIosCount = previousIosCount;
    obj.newIosCount = iosNext.length;
    obj.promotedSourceTypes = promotedSourceTypes;
    fs.writeFileSync(REPORT, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  } catch {}

  const topSourceNames = Object.entries(promotedSourceNames).sort((a,b)=>b[1]-a[1]).slice(0,10);
  console.log(`Promoted this run: ${promoted}`);
  console.log(`Promoted sourceType: ${JSON.stringify(promotedSourceTypes)}`);
  console.log(`Promoted sourceName top10: ${JSON.stringify(topSourceNames)}`);
}

if (require.main === module) { run(); }
module.exports = { run };
