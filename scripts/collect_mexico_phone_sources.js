const fs = require('fs');
const path = require('path');
let axios = null; try { axios = require('axios'); } catch (_) {}
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOG = path.join(DATA_DIR, 'source_catalog_mexico.json');
const COLLECTED = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const CROWD = path.join(DATA_DIR, 'crowd_signal_mexico_numbers.json');
const LOG = path.join(DATA_DIR, 'collector_run_log.json');
const SUMMARY = path.join(__dirname, '..', 'reports', 'collection-summary.json');
const SEED = path.join(DATA_DIR, 'mexico_seed_phone_numbers.json');
const SCAM = path.join(__dirname, '..', 'scam_numbers.json');

const args = process.argv.slice(2);
const target = Number((args.find(a => a.startsWith('--target=')) || '--target=1000').split('=')[1]);
const min = Number((args.find(a => a.startsWith('--min=')) || '--min=300').split('=')[1]);
const maxAdd = Number((args.find(a => a.startsWith('--max-add=')) || '--max-add=2000').split('=')[1]);
const maxPagesPerSource = Number((args.find(a => a.startsWith('--max-pages=')) || '--max-pages=20').split('=')[1]);
const maxMinutes = Number((args.find(a => a.startsWith('--max-minutes=')) || '--max-minutes=10').split('=')[1]);
const deadline = Date.now() + Math.max(1, maxMinutes) * 60 * 1000;

const read = (p) => { if (!fs.existsSync(p)) return []; const v = JSON.parse(fs.readFileSync(p, 'utf8')); if (Array.isArray(v)) return v; if (v && Array.isArray(v.records)) return v.records; return []; };
const write = (p, d) => fs.writeFileSync(p, `${JSON.stringify(d, null, 2)}
`);
const TEST_NUMBERS = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);
const headers = {'User-Agent': 'Mozilla/5.0 Chrome Safari','Accept': 'text/html,application/xhtml+xml','Accept-Language': 'es-MX,es;q=0.9,en;q=0.8','Cache-Control': 'no-cache'};
const phoneRegex = /(?:\+?52\s*1?[\s\-\(\)]*)?(?:\(?\d{2,3}\)?[\s\-]*)?\d{3,4}[\s\-]?\d{4}|\d{10,13}/g;
const isDateLike = (n) => /^20\d{8}$/.test(n) || /^19\d{8}$/.test(n);
function valid(n) { if (!/^\d{10}$/.test(n)) return false; if (TEST_NUMBERS.has(n)) return false; if (isDateLike(n)) return false; if (isInvalidNumber(n)) return false; return true; }

function normalizeCategory(v) {
  const t = String(v || '').toLowerCase();
  if (['telemarketing','collection'].includes(t)) return t;
  return 'spam_or_unwanted';
}

function toRecord(n, s, confidence='medium') {
  const sourceType = String(s.type || 'community_report').toLowerCase();
  const category = normalizeCategory(s.category || 'spam_or_unwanted');
  const today = new Date().toISOString().slice(0, 10);
  return {
    number: n,
    normalizedNumber: n,
    country: 'MX',
    tag: 'suspicious',
    label: 'Número reportado',
    type: sourceType,
    sourceType,
    confidence,
    source: s.name,
    sourceName: s.name,
    sourceUrl: s.url,
    source_url: s.url,
    category,
    risk_label: 'reported',
    first_seen: today,
    last_seen: today,
    updatedAt: today
  };
}

function buildPageUrls(sourceUrl) {
  const urls = [sourceUrl];
  const u = String(sourceUrl || '');
  for (let page = 2; page <= maxPagesPerSource; page++) {
    if (/telefonospam\.com\.mx|numerostelefono\.com\/mx|callinsider\.mx|lada-mexico\.com/i.test(u)) urls.push(`${u.replace(/\/$/, '')}${u.includes('?') ? '&' : '?'}page=${page}`);
    else break;
  }
  return urls.slice(0, maxPagesPerSource);
}

async function fetchPage(url) {
  try {
    if (axios) {
      const res = await axios.get(url, { headers, timeout: 30000, responseType: 'text', validateStatus: () => true });
      if (res.status >= 200 && res.status < 400) return String(res.data || '');
      throw new Error(`axios HTTP ${res.status}`);
    }
    throw new Error('axios unavailable');
  } catch (_) {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`fetch HTTP ${r.status}`);
    return await r.text();
  }
}

(async () => {
  const catalog = read(CATALOG).filter(x => isHttpUrl(x.url));
  const prevCollected = read(COLLECTED);
  const prevCrowd = read(CROWD);
  const mergedInputs = [...read(SEED), ...prevCollected, ...read(SCAM)];
  const byNumber = new Map();
  for (const r of mergedInputs) {
    const n = normalizeMXNumber(r.normalizedNumber || r.number || '');
    if (valid(n)) byNumber.set(n, { ...toRecord(n, { name: r.sourceName || r.source || 'existing', url: r.sourceUrl || 'https://example.com', type: r.sourceType || r.type || 'community_report', category: r.category || 'spam_or_unwanted' }, r.confidence || 'medium'), ...r, normalizedNumber: n, number: n, source_url: r.source_url || r.sourceUrl || '', first_seen: r.first_seen || r.updatedAt || new Date().toISOString().slice(0,10), last_seen: new Date().toISOString().slice(0,10) });
  }
  const runLog = { generatedAt:new Date().toISOString(), target, maxMinutes, sourceCount:catalog.length, sources:[], warnings:[] };
  const seenInRun = new Set();
  const addedBySource = {};
  let duplicateCount = 0;
  let invalidCount = 0;
  for (const s of catalog) {
    if (Date.now() > deadline || byNumber.size >= target) break;
    const entry = { source:s.name, url:s.url, accepted:0, duplicates:0, invalid:0, errors:[] };
    try {
      for (const pageUrl of buildPageUrls(s.url)) {
        if (Date.now() > deadline || byNumber.size >= target || (byNumber.size - prevCollected.length) >= maxAdd) break;
        const html = await fetchPage(pageUrl);
        const matches = String(html).match(phoneRegex) || [];
        for (const raw of matches) {
          const n = normalizeMXNumber(raw);
          if (!valid(n)) { invalidCount++; entry.invalid++; continue; }
          if (seenInRun.has(`${s.url}|${n}`)) { duplicateCount++; entry.duplicates++; continue; }
          seenInRun.add(`${s.url}|${n}`);
          if (byNumber.has(n)) { duplicateCount++; entry.duplicates++; continue; }
          byNumber.set(n, toRecord(n, s, String(s.confidence || 'low')));
          entry.accepted++;
          addedBySource[s.url] = (addedBySource[s.url] || 0) + 1;
        }
      }
    } catch (e) { entry.errors.push(e.message); }
    runLog.sources.push(entry);
  }

  const nextCollected = Array.from(byNumber.values()).filter(r => valid(String(r.normalizedNumber || '')));
  const prevOrder = prevCollected.filter(r => valid(normalizeMXNumber(r.normalizedNumber || r.number || '')));
  const seen = new Set(prevOrder.map(r => normalizeMXNumber(r.normalizedNumber || r.number || '')));
  const appended = [];
  for (const r of nextCollected) { const n = normalizeMXNumber(r.normalizedNumber || r.number || ''); if (!seen.has(n)) { seen.add(n); appended.push(r); } }
  const finalRows = [...prevOrder, ...appended];

  write(COLLECTED, finalRows);
  write(CROWD, prevCrowd);
  runLog.finalCount = finalRows.length;
  write(LOG, runLog);
  fs.mkdirSync(path.dirname(SUMMARY), { recursive: true });
  write(SUMMARY, {
    before_count: prevCollected.length,
    after_count: finalRows.length,
    added_count: appended.length,
    duplicate_count: duplicateCount,
    invalid_count: invalidCount,
    added_by_source: addedBySource
  });

  console.log(`collector done collected=${finalRows.length} target=${target} min=${min} maxAdd=${maxAdd} added=${appended.length}`);
})();
