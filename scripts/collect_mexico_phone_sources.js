const fs = require('fs');
const path = require('path');
let axios = null; try { axios = require('axios'); } catch (_) {}
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CATALOG = path.join(DATA_DIR, 'source_catalog_mexico.json');
const COLLECTED = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const SUMMARY = path.join(__dirname, '..', 'reports', 'collection-summary.json');
const SCAM = path.join(__dirname, '..', 'scam_numbers.json');

const args = process.argv.slice(2);
const target = Number((args.find(a => a.startsWith('--target=')) || '--target=5000').split('=')[1]);
const maxPagesPerSource = Number((args.find(a => a.startsWith('--max-pages=')) || '--max-pages=10').split('=')[1]);
const maxMinutes = Number((args.find(a => a.startsWith('--max-minutes=')) || '--max-minutes=10').split('=')[1]);
const deadline = Date.now() + Math.max(1, maxMinutes) * 60 * 1000;

const read = (p, fallback = []) => {
  if (!fs.existsSync(p)) return fallback;
  const v = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(v) ? v : fallback;
};
const write = (p, d) => fs.writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);
const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-MX,es;q=0.9' };
const phoneRegex = /(?:\+?52[\s\-\(\)]*)?(?:\(?\d{2,3}\)?[\s\-]*)?\d{3,4}[\s\-]?\d{4}|\b\d{10,13}\b/g;

function valid(n) {
  if (!/^\d{10}$/.test(n)) return false;
  if (isInvalidNumber(n)) return false;
  if (/^(19|20)\d{8}$/.test(n)) return false;
  return true;
}

function toRecord(n, s) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    number: n,
    normalizedNumber: n,
    country: 'MX',
    label: 'Número reportado',
    tag: 'suspicious',
    sourceName: s.name,
    sourceUrl: s.url,
    source_url: s.url,
    sourceType: String(s.type || 'community_report'),
    category: 'spam_or_unwanted',
    risk_label: 'reported',
    first_seen: today,
    last_seen: today,
    updatedAt: today
  };
}

function buildPageUrls(url) {
  const out = [url];
  for (let page = 2; page <= maxPagesPerSource; page++) out.push(`${url.replace(/\/$/, '')}${url.includes('?') ? '&' : '?'}page=${page}`);
  return out;
}

async function fetchPage(url) {
  if (axios) {
    const res = await axios.get(url, { headers, timeout: 30000, responseType: 'text', validateStatus: () => true });
    if (res.status >= 200 && res.status < 400) return String(res.data || '');
    throw new Error(`HTTP ${res.status}`);
  }
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

(async () => {
  const catalog = read(CATALOG).filter(x => isHttpUrl(x.url));
  const before = read(COLLECTED);
  const scam = read(SCAM);

  const existing = new Set(before.map(r => normalizeMXNumber(r.normalizedNumber || r.number || '')));
  const mergedExisting = new Set([...existing, ...scam.map(r => normalizeMXNumber(r.normalizedNumber || r.number || ''))]);

  const added = [];
  const addedBySource = {};
  let collectedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;

  for (const s of catalog) {
    if (Date.now() > deadline) break;
    for (const pageUrl of buildPageUrls(s.url)) {
      if (Date.now() > deadline) break;
      try {
        const html = await fetchPage(pageUrl);
        const matches = String(html).match(phoneRegex) || [];
        for (const raw of matches) {
          collectedCount++;
          const n = normalizeMXNumber(raw);
          if (!valid(n)) { rejectedCount++; continue; }
          if (mergedExisting.has(n)) { duplicateCount++; continue; }
          mergedExisting.add(n);
          if (!existing.has(n)) {
            existing.add(n);
            added.push(toRecord(n, s));
            addedBySource[s.url] = (addedBySource[s.url] || 0) + 1;
          }
        }
      } catch (_) {}
    }
  }

  const next = [...before, ...added];
  write(COLLECTED, next);
  fs.mkdirSync(path.dirname(SUMMARY), { recursive: true });
  write(SUMMARY, {
    before_count: before.length,
    collected_count: collectedCount,
    valid_new_count: added.length,
    duplicate_count: duplicateCount,
    rejected_count: rejectedCount,
    after_count_if_merged: mergedExisting.size,
    added_by_source: addedBySource
  });

  console.log(`before=${before.length} collected=${collectedCount} valid_new=${added.length} after_if_merged=${mergedExisting.size} target=${target}`);
  if (mergedExisting.size < target) console.log('target_not_reached: skip merge to official database');
})();
