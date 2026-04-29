const fs = require('fs');
const path = require('path');
const { isInvalidNumber, isHttpUrl, TRUSTED_TYPES, TRUSTED_CONFIDENCE } = require('./data_rules');

const root = path.join(__dirname, '..');

const readJson = (relativePath, fallback = null) => {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

const readRecords = (relativePath) => {
  const payload = readJson(relativePath, []);
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.records)) return payload.records;
  return [];
};

const getValidSearchableCount = (records) =>
  (records || []).filter((record) => {
    const tag = String(record?.tag || '').toLowerCase();
    const normalized = String(record?.normalizedNumber || '');
    if (!['scam', 'suspicious'].includes(tag)) return false;
    if (isInvalidNumber(normalized)) return false;
    return /^\d{10}$/.test(normalized);
  }).length;

const collected = readRecords('data/collected_mexico_numbers.json');
const ios = readRecords('data/ios_numbers.json');
const seed = readRecords('data/mexico_seed_phone_numbers.json');
const scamNumbers = readRecords('scam_numbers.json');
const signals = readRecords('data/crowd_signal_mexico_numbers.json');
const catalog = readRecords('data/source_catalog_mexico.json');
const runLog = readJson('data/collector_run_log.json', { sources: [] });
const previousPublicStats = readJson('data/public_stats.json', {});

const today = new Date().toISOString().slice(0, 10);
const trusted = collected.filter((r) =>
  TRUSTED_TYPES.has(String(r.type || '').toLowerCase()) &&
  TRUSTED_CONFIDENCE.has(String(r.confidence || '').toLowerCase()) &&
  ['scam', 'suspicious'].includes(String(r.tag || '').toLowerCase()) &&
  isHttpUrl(r.sourceUrl) &&
  !isInvalidNumber(String(r.normalizedNumber || ''))
);

const officialCount = trusted.filter((r) => ['official', 'government', 'police'].includes(String(r.type || '').toLowerCase())).length;
const mediaCount = trusted.filter((r) => String(r.type || '').toLowerCase() === 'media').length;
const todayAddedCount = trusted.filter((r) => String(r.updatedAt || r.collectedAt || '').startsWith(today)).length;
const succ = (runLog.sources || []).filter((s) => (s.accepted || 0) > 0).length;
const fail = (runLog.sources || []).filter((s) => (s.accepted || 0) === 0 && (s.errors || []).length > 0).length;

const bySource = {};
for (const r of trusted) bySource[r.source] = (bySource[r.source] || 0) + 1;
const topSources = Object.entries(bySource)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([source, count]) => ({ source, count }));

const collectedSearchableCount = getValidSearchableCount(collected);
const iosSearchableCount = getValidSearchableCount(ios);
const seedSearchableCount = getValidSearchableCount(seed);
const scamSearchableCount = getValidSearchableCount(scamNumbers);

const totalSearchableCount = collectedSearchableCount;
const trustedDisplayCount = trusted.length;

const generatedAt = new Date().toISOString();
const nextUpdateAt = new Date(new Date(generatedAt).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

const output = {
  generatedAt,
  nextUpdateAt,
  totalSearchableCount,
  trustedDisplayCount,
  officialCount,
  mediaCount,
  iosExportCount: ios.length,
  signalCount: signals.length,
  totalTrustedCount: trusted.length,
  todayAddedCount,
  sourceCount: catalog.length,
  sourceSuccessCount: succ,
  sourceFailedCount: fail,
  lastCollectorStatus: runLog.lastCollectorStatus || 'partial',
  fallbackCounts: {
    collected: collected.length,
    ios: ios.length,
    seed: seed.length,
    scam: scamNumbers.length
  },
  topSources
};

fs.writeFileSync(path.join(root, 'data/public_stats.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated public stats. searchable=${totalSearchableCount}, trusted=${trusted.length}`);
