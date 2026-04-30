const fs = require('fs');
const path = require('path');
const { normalizeMXNumber, isInvalidNumber, isHttpUrl } = require('./data_rules');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COLLECTED = path.join(DATA_DIR, 'collected_mexico_numbers.json');
const CROWD = path.join(DATA_DIR, 'crowd_signal_mexico_numbers.json');
const LOG = path.join(DATA_DIR, 'collector_run_log.json');
const CATALOG = path.join(DATA_DIR, 'source_catalog_mexico.json');

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const target = targetArg ? Number(targetArg.split('=')[1]) : 0;
const maxMs = 10 * 60 * 1000;
const startedAt = Date.now();

const readArray = (p) => fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) || []) : [];
const writeJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');

const trustedTypes = new Set(['official', 'government', 'police', 'fiscalia']);
const mediaTypes = new Set(['media']);
const crowdTypes = new Set(['crowd']);

const phoneRegex = /(?:\+?52[\s\-]?)?(?:\(?\d{2,3}\)?[\s\-]?\d{3,4}[\s\-]?\d{4}|\d{10})/g;

function extractPhones(text) { return String(text || '').match(phoneRegex) || []; }

function recordFor(source, normalized, nowIso, nowDate) {
  const type = String(source.type || '').toLowerCase();
  let tag = 'suspicious';
  let confidence = 'medium';
  if (trustedTypes.has(type)) { tag = String(source.tag || 'scam').toLowerCase() === 'suspicious' ? 'suspicious' : 'scam'; confidence = String(source.confidence || 'high').toLowerCase() === 'medium' ? 'medium' : 'high'; }
  else if (mediaTypes.has(type)) { tag = 'suspicious'; confidence = 'medium'; }
  else { tag = 'suspicious'; confidence = 'low'; }
  return { number: normalized, normalizedNumber: normalized, country: 'MX', tag, label: tag === 'scam' ? 'Posible fraude' : 'Número sospechoso', type, confidence, source: source.name, sourceUrl: source.url, sources: [{ source: source.name, sourceUrl: source.url, type, confidence }], note: 'Número detectado en fuente pública.', reviewStatus: 'auto_imported', collectedAt: nowIso, updatedAt: nowDate };
}

async function fetchHtml(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es-MX,es;q=0.9' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

(async () => {
  const sources = readArray(CATALOG).filter((s) => isHttpUrl(s.url));
  const oldCollected = readArray(COLLECTED);
  const oldCrowd = readArray(CROWD);
  const byNumber = new Map(oldCollected.map((r) => [r.normalizedNumber, r]));
  const crowdSignals = new Map(oldCrowd.map((r) => [r.normalizedNumber, r]));
  const crowdEvidence = new Map();
  const runLog = { generatedAt: new Date().toISOString(), target, sources: [], warnings: [] };
  const nowIso = new Date().toISOString();
  const nowDate = nowIso.slice(0, 10);

  for (const s of sources) {
    if (Date.now() - startedAt > maxMs) { runLog.warnings.push('timeout_reached'); break; }
    if (target > 0 && byNumber.size >= target) break;
    const log = { source: s.name, url: s.url, accepted: 0, crowdOnly: 0, errors: [] };
    try {
      const html = await fetchHtml(s.url);
      const hits = extractPhones(html);
      for (const raw of hits) {
        const normalized = normalizeMXNumber(raw);
        if (isInvalidNumber(normalized)) continue;
        const rec = recordFor(s, normalized, nowIso, nowDate);
        const existing = byNumber.get(normalized);
        if (trustedTypes.has(rec.type) || mediaTypes.has(rec.type)) {
          if (!existing) { byNumber.set(normalized, rec); log.accepted++; }
          else {
            const srcs = new Map((existing.sources || []).map((x) => [`${x.sourceUrl}|${x.source}`, x]));
            for (const src of rec.sources) srcs.set(`${src.sourceUrl}|${src.source}`, src);
            existing.sources = Array.from(srcs.values());
            existing.updatedAt = nowDate;
          }
        } else if (crowdTypes.has(rec.type)) {
          const set = crowdEvidence.get(normalized) || new Set();
          set.add(rec.sourceUrl); crowdEvidence.set(normalized, set);
          if (!crowdSignals.has(normalized)) crowdSignals.set(normalized, { ...rec, type: 'crowd_signal', confidence: 'low' });
          if (set.size >= 2 && !byNumber.has(normalized)) {
            byNumber.set(normalized, { ...rec, confidence: 'medium', tag: 'suspicious', type: 'crowd' });
            log.accepted++;
          } else log.crowdOnly++;
        }
      }
    } catch (e) { log.errors.push(String(e.message || e)); }
    runLog.sources.push(log);
  }

  const outCollected = Array.from(byNumber.values()).filter((r) => /^\d{10}$/.test(String(r.normalizedNumber || '')));
  writeJson(COLLECTED, outCollected.sort((a, b) => a.normalizedNumber.localeCompare(b.normalizedNumber)));
  writeJson(CROWD, Array.from(crowdSignals.values()).sort((a, b) => a.normalizedNumber.localeCompare(b.normalizedNumber)));
  runLog.lastCollectorStatus = outCollected.length > 0 ? 'ok' : 'partial';
  runLog.finalCount = outCollected.length;
  writeJson(LOG, runLog);
  console.log(`collected=${outCollected.length} crowd=${crowdSignals.size} target=${target}`);
})();
