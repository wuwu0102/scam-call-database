const fs = require('fs');
const path = require('path');
const { BLOCKED_LOCAL_SOURCES, normalizeMXNumber, isInvalidNumber } = require('./data_rules');

const root = path.join(__dirname, '..');
const collectedPath = path.join(root, 'data/collected_mexico_numbers.json');
const statsPath = path.join(root, 'data/public_stats.json');

const collected = fs.existsSync(collectedPath) ? JSON.parse(fs.readFileSync(collectedPath, 'utf8')) : [];
const prevStats = fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) : {};

let fatal = false;
if (collected.length < 17) { console.error('FATAL: collected cannot be below 17'); fatal = true; }

const prevCount = Number(prevStats.fallbackCounts?.collected || prevStats.totalTrustedCount || 0);
if (prevCount > 0 && collected.length < Math.floor(prevCount * 0.7)) { console.error(`FATAL: collected dropped over 30%. prev=${prevCount} now=${collected.length}`); fatal = true; }

for (const r of collected) {
  const sourceUrl = String(r.sourceUrl || '');
  const tag = r.tag;
  if (BLOCKED_LOCAL_SOURCES.has(sourceUrl)) fatal = true, console.error(`FATAL: blocked local source ${sourceUrl}`);
  if (typeof tag === 'object') fatal = true, console.error('FATAL: tag object found');
  if (['safe', 'unknown'].includes(String(tag || '').toLowerCase())) fatal = true, console.error(`FATAL: invalid tag ${tag}`);
  const n = normalizeMXNumber(r.normalizedNumber || r.number || '');
  if (!/^\d{10}$/.test(n) || isInvalidNumber(n)) fatal = true, console.error(`FATAL: invalid number ${n}`);
}

if (fatal) process.exit(1);
console.log('Data safety checks passed');
