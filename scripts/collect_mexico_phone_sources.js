const fs = require('fs');
const path = require('path');
let axios = null;
try { axios = require('axios'); } catch {}
const { normalizeMXNumber, isInvalidNumber, isHttpUrl, sanitizeTag, TRUSTED_TYPES, TRUSTED_CONFIDENCE } = require('./data_rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const CROWD = path.join(DATA_DIR, 'crowd_signal_mexico_numbers.json');
const LOG = path.join(DATA_DIR, 'collector_run_log.json');
const CATALOG = path.join(DATA_DIR, 'source_catalog_mexico.json');

const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8', 'Cache-Control': 'no-cache' };
const readArray = (p) => fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) || []) : [];
const extract = (t) => String(t || '').match(/(?:\+?52[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}|\d{10})/g) || [];

async function fetchPublicPage(url) {
  if (axios) {
    try { const r = await axios.get(url, { headers, timeout: 20000 }); return String(r.data || ''); } catch {}
  }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

function isTrusted(rec) {
  return TRUSTED_TYPES.has(String(rec.type || '').toLowerCase()) && TRUSTED_CONFIDENCE.has(String(rec.confidence || '').toLowerCase()) && ['scam', 'suspicious'].includes(String(rec.tag || '').toLowerCase()) && isHttpUrl(rec.sourceUrl) && !isInvalidNumber(rec.normalizedNumber);
}

function cleanRecord(raw, source, nowIso, nowDate) {
  const normalizedNumber = normalizeMXNumber(raw);
  if (isInvalidNumber(normalizedNumber)) return null;
  const type = String(source.type || '').toLowerCase();
  const tag = sanitizeTag(source.tag, type);
  if (!tag) return null;
  const rec = { number: normalizedNumber, normalizedNumber, country: 'MX', tag, label: tag === 'scam' ? 'Posible fraude' : 'Número sospechoso', type, confidence: String(source.confidence || 'medium').toLowerCase(), source: source.name, sourceUrl: source.url, collectedAt: nowIso, updatedAt: nowDate };
  return rec;
}

(async () => {
  const sources = readArray(CATALOG);
  const runLog = { generatedAt: new Date().toISOString(), sources: [] };
  const oldCollected = readArray(COLLECTED);
  const oldCrowd = readArray(CROWD);
  const trusted = new Map(oldCollected.filter(isTrusted).map((r) => [r.normalizedNumber, r]));
  const crowd = new Map(oldCrowd.map((r) => [r.normalizedNumber, r]));
  const nowIso = new Date().toISOString(); const nowDate = nowIso.slice(0, 10);
  let added = 0;

  for (const s of sources) {
    const log = { source: s.name, url: s.url, accepted: 0, errors: [] };
    try {
      const html = await fetchPublicPage(s.url);
      for (const c of extract(html)) {
        const rec = cleanRecord(c, s, nowIso, nowDate); if (!rec) continue;
        if (isTrusted(rec)) {
          if (!trusted.has(rec.normalizedNumber)) { trusted.set(rec.normalizedNumber, rec); added++; log.accepted++; }
        } else {
          if (!crowd.has(rec.normalizedNumber)) crowd.set(rec.normalizedNumber, { ...rec, tag: 'suspicious', confidence: 'low', type: 'crowd_signal' });
        }
      }
    } catch (e) { log.errors.push(String(e.message || e)); }
    runLog.sources.push(log);
  }

  const allFailed = runLog.sources.length > 0 && runLog.sources.every((s) => s.errors.length > 0);
  runLog.lastCollectorStatus = allFailed ? 'preserved' : (added > 0 ? 'ok' : 'partial');
  const outputTrusted = Array.from(trusted.values()).filter(isTrusted).sort((a, b) => a.normalizedNumber.localeCompare(b.normalizedNumber));
  if (outputTrusted.length > 0) {
    fs.writeFileSync(COLLECTED, JSON.stringify(outputTrusted, null, 2) + '\n');
  }
  if (!allFailed) fs.writeFileSync(CROWD, JSON.stringify(Array.from(crowd.values()), null, 2) + '\n');
  fs.writeFileSync(LOG, JSON.stringify(runLog, null, 2) + '\n');
  console.log(`trusted=${trusted.size} added=${added} status=${runLog.lastCollectorStatus}`);
})();
