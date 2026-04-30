const fs = require('fs');
const path = require('path');
let axios = null; try { axios = require('axios'); } catch (_) {}
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOG = path.join(DATA_DIR, 'source_catalog_mexico.json');
const COLLECTED = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const CROWD = path.join(DATA_DIR, 'crowd_signal_mexico_numbers.json');
const LOG = path.join(DATA_DIR, 'collector_run_log.json');
const SEED = path.join(DATA_DIR, 'mexico_seed_phone_numbers.json');
const SCAM = path.join(__dirname, '..', 'scam_numbers.json');

const args = process.argv.slice(2);
const target = Number((args.find(a => a.startsWith('--target=')) || '--target=1000').split('=')[1]);
const maxMinutes = Number((args.find(a => a.startsWith('--max-minutes=')) || '--max-minutes=10').split('=')[1]);
const deadline = Date.now() + Math.max(1, maxMinutes) * 60 * 1000;

const read = (p) => { if (!fs.existsSync(p)) return []; const v = JSON.parse(fs.readFileSync(p, 'utf8')); if (Array.isArray(v)) return v; if (v && Array.isArray(v.records)) return v.records; return []; };
const write = (p, d) => fs.writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);
const TEST_NUMBERS = new Set(['0000000000','1111111111','1234567890','5555555555','9999999999','2025550101','2025550102','2025550103','2025550104','2025550105']);
const headers = {
  'User-Agent': 'Mozilla/5.0 Chrome Safari',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache'
};

const phoneRegex = /(?:\+?52\s*1?[\s\-\(\)]*)?(?:\(?\d{2,3}\)?[\s\-]*)?\d{3,4}[\s\-]?\d{4}|\b\d{10,13}\b/g;
const isDateLike = (n) => /^20\d{8}$/.test(n) || /^19\d{8}$/.test(n);
function valid(n) {
  if (!/^\d{10}$/.test(n)) return false;
  if (TEST_NUMBERS.has(n)) return false;
  if (isDateLike(n)) return false;
  if (isInvalidNumber(n)) return false;
  return true;
}

function rank(t) {
  const k = String(t || '').toLowerCase();
  if (['official','government','police','fiscalia'].includes(k)) return 3;
  if (k === 'media') return 2;
  return 1;
}

function toRecord(n, s, confidence='medium') {
  const t = String(s.type || '').toLowerCase();
  const tag = ['official','government','police','fiscalia'].includes(t) ? 'scam' : 'suspicious';
  return { number:n, normalizedNumber:n, country:'MX', tag, label:'Número sospechoso', type:t, confidence, source:s.name, sourceUrl:s.url, sources:[{source:s.name,sourceUrl:s.url,type:t,confidence}], updatedAt:new Date().toISOString().slice(0,10) };
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
    if (valid(n)) byNumber.set(n, { ...toRecord(n, {name:r.source||'existing', url:r.sourceUrl||'https://example.com', type:r.type||'media'}, r.confidence||'medium'), ...r, normalizedNumber:n, number:n });
  }
  const crowdMap = new Map(prevCrowd.map(r => [r.normalizedNumber, r]));
  const crowdEvidence = new Map();
  const runLog = { generatedAt:new Date().toISOString(), target, maxMinutes, sourceCount:catalog.length, sources:[], warnings:[] };

  for (const s of catalog) {
    if (Date.now() > deadline) { runLog.warnings.push('max_minutes_reached'); break; }
    if (byNumber.size >= target) break;
    const entry = { source:s.name, url:s.url, accepted:0, crowdOnly:0, errors:[] };
    try {
      const html = await fetchPage(s.url);
      const matches = String(html).match(phoneRegex) || [];
      for (const raw of matches) {
        const n = normalizeMXNumber(raw);
        if (!valid(n)) continue;
        const t = String(s.type || '').toLowerCase();
        if (['official','government','police','fiscalia'].includes(t)) {
          const next = toRecord(n, s, String(s.confidence || 'medium'));
          const old = byNumber.get(n);
          if (!old || rank(next.type) > rank(old.type)) byNumber.set(n, next);
          entry.accepted++;
        } else if (t === 'media') {
          const old = byNumber.get(n);
          if (!old || rank(old.type) < 2) byNumber.set(n, toRecord(n, s, 'medium'));
          entry.accepted++;
          const ev = crowdEvidence.get(n) || new Set(); ev.add(s.url); crowdEvidence.set(n, ev);
        } else {
          const ev = crowdEvidence.get(n) || new Set(); ev.add(s.url); crowdEvidence.set(n, ev);
          if (!crowdMap.has(n)) crowdMap.set(n, { ...toRecord(n, s, 'low'), type:'crowd' });
          if (ev.size >= 2 && !byNumber.has(n)) { byNumber.set(n, { ...toRecord(n, s, 'medium'), type:'crowd_multi_source' }); entry.accepted++; }
          else entry.crowdOnly++;
        }
      }
    } catch (e) { entry.errors.push(e.message); }
    runLog.sources.push(entry);
  }

  const nextCollected = Array.from(byNumber.values()).filter(r => valid(String(r.normalizedNumber || '')) && isHttpUrl(r.sourceUrl));
  const finalCollected = nextCollected.length < prevCollected.length ? prevCollected : nextCollected;
  if (nextCollected.length < prevCollected.length) runLog.warnings.push(`preserved_old_collected prev=${prevCollected.length} new=${nextCollected.length}`);
  runLog.lastCollectorStatus = runLog.sources.every(s => (s.errors || []).length) ? 'failed' : (nextCollected.length < prevCollected.length ? 'preserved' : (nextCollected.length >= target ? 'ok' : 'partial'));
  runLog.finalCount = finalCollected.length;

  write(COLLECTED, finalCollected.sort((a,b)=>String(a.normalizedNumber).localeCompare(String(b.normalizedNumber))));
  write(CROWD, Array.from(crowdMap.values()).filter(r => valid(String(r.normalizedNumber))).sort((a,b)=>a.normalizedNumber.localeCompare(b.normalizedNumber)));
  write(LOG, runLog);
  console.log(`collector done collected=${finalCollected.length} crowd=${crowdMap.size} target=${target}`);
})();
